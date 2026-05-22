# Clinician Sign-up — Design Spec

**Date:** 2026-05-22
**Status:** Approved for implementation
**Implementer:** `features` tentacle (Octogent)
**Coordination:** Schema is already in place; no `infra` work required for v1. QA after deploy.

## Goal

Add a self-serve sign-up path for healthcare providers (clinicians), gated by
admin verification. Patient sign-up is unchanged. Login is a single shared
endpoint regardless of role.

## Decisions locked in during brainstorming

| Topic | Decision | Rationale |
|---|---|---|
| Verification model | **Open self-serve, admin gates** | Lowest infra cost; admin flips `clinician_profiles.verified` in the Supabase dashboard (manual approval). Allow-list / hospital domain auto-verify deferred. |
| Pre-auth placement | **Login is the landing**; role-pick gates only sign-up | Returning users (majority) skip the role question. Role-pick is reached via "Don't have an account? Sign up" on LoginScreen. |
| Required fields | **Tiered**: email, password, full name required; license #, hospital affiliation optional with nudge | Path-of-least-resistance still produces a usable submission. Optional fields can be added post-signup from the pending screen. |
| Email confirmation | **Required for clinicians** | Real-deliverability signal. Cannot proceed past "Check your email" until confirmed. Single backend toggle (Supabase Auth `mailer_autoconfirm = false`). |
| PDPA consent | **Shared screen** (existing `PDPAConsentScreen`) | Reuse existing copy. Differentiated copy deferred. |
| Phone number | **Skip for v1** | Not in schema. Add later if verification-by-phone becomes a real workflow. |
| Architecture | **Approach A — minimal new surface** | Three new screens; existing screens reused. AuthNavigator + AppNavigator each get one small branch added. |
| Coral accent for clinician path | **Yes** | Subtle within-brand differentiator (`COLORS.accent #E8755A` vs `COLORS.primary #0B6E6E`). Prevents tap-target confusion. |
| Pending-screen "Add license/hospital" CTA style | **Primary teal solid** | Active nudge — completing these speeds up admin verification. |

## New screens

### `RoleSelectScreen`

**Purpose:** One-off choice that routes the user into one of two sign-up flows.
Never re-shown once a user has an account.

**Layout:**
- Brand mark (gradient `H` in 56×56 rounded square, same gradient as app icon
  and Passport hero: `primaryGradientStart → primaryGradientEnd`)
- Display heading "Create your account" (Fraunces 800, h2)
- Subtitle "How will you use HaemoCare?" (textSecondary)
- Two stacked cards, each:
  - 40×40 icon tile with role-color tint (`#E4F5F4` for patient → teal icon,
    `#FFF0EC` for clinician → coral icon)
  - Title (700, 15) + one-line description (textSecondary, 12)
  - Right chevron (Ionicons `chevron-forward`, `textLight`)
- "← Back to log in" link (primary teal) at bottom

**Behavior:**
- Patient card → `navigation.replace('Signup')` (existing screen)
- Clinician card → `navigation.replace('ClinicianSignup')` (new screen)
- Back link → `navigation.replace('Login')`

**Icons:** Ionicons `person-outline` (patient), `medkit-outline` (clinician).
NO emoji per project rule.

### `ClinicianSignupScreen`

**Purpose:** Collect the data needed to (a) create an auth user and (b) give
the admin enough info to verify.

**Form sections** (in order, visually grouped with section labels):

**Required**
- Email (email keyboard, autoCapitalize none, autoComplete email)
- Password (secureTextEntry, autoComplete new-password, minimum 8 chars
  — match existing patient signup validation)
- Full name (autoCapitalize words)

**Speeds up verification** (visible label, with "Optional — you can add these later" subtitle)
- License number (text)
- Hospital affiliation (text)

**Submit:**
- Primary teal solid button "Create account" (full width, `RADIUS.lg`)
- "← Back" link (primary teal)

**On submit:**
1. Validate (required fields present, email format, password length).
2. `supabase.auth.signUp({ email, password })`. If error → surface message via
   existing error display pattern (`setError(result.error)` — same as patient
   `SignupScreen.tsx`).
3. On success: immediately upsert a `clinician_profiles` row with
   `user_id`, `full_name`, `license_number` (or empty string), `hospital_affiliation`
   (or empty string), `verified: false`. The row must exist before the user
   completes email confirmation, so that on first login AuthContext can detect
   "is clinician, pending verification" and route correctly.
4. Show a "Check your email" confirmation screen (reuse / mirror the pattern
   from patient signup — if patient signup currently auto-logs-in because
   `mailer_autoconfirm` was true, this will be NEW behavior, see Backend
   Changes below).

### `PendingVerificationScreen`

**Purpose:** What a clinician sees after first successful login while
`clinician_profiles.verified === false`. Replaces `ClinicianStackNavigator`
in the AppNavigator routing.

**Layout:**
- Centered hero: 72×72 rounded square with gold/amber gradient
  (`statusMonitor #E8933A → gold #D4A853`), white `time-outline` icon
- Display heading "Pending verification" (Fraunces 800, h2)
- Body copy: "Thanks for signing up. Our team is reviewing your credentials.
  You'll get full access once approved (usually 1–2 business days)."
- Submission summary card: white surface, shows their submitted full name,
  license # (or "not provided"), hospital (or "not provided")
- Primary teal solid CTA "+ Add license & hospital" — only shown if either
  optional field is empty. Routes to a profile-edit screen they CAN access
  while pending (see Routing Changes).
- Ghost "Sign out" button (textSecondary, no background)

**Behavior:**
- "Add license & hospital" → routes to an edit flow that updates the same
  `clinician_profiles` row. On save, returns to this screen with the
  newly-filled values shown.
- "Sign out" → existing `signOut()` from AuthContext.

## Routing changes

### `AuthNavigator` (new screens)

```diff
  <Stack.Screen name="Splash" component={SplashScreen} />
  <Stack.Screen name="Login" component={LoginScreen} />
  <Stack.Screen name="Signup" component={SignupScreen} />
+ <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
+ <Stack.Screen name="ClinicianSignup" component={ClinicianSignupScreen} />
```

Plus update `AuthStackParamList` in `src/types/navigation.ts` to add the two
new screens.

### `LoginScreen` (one link change)

Change the existing "Sign up" link to navigate to `RoleSelect` instead of
directly to `Signup`. This is the only change to `LoginScreen`.

### `AppNavigator` (one new branch)

After the existing `if (role === 'clinician') return <ClinicianStackNavigator />;`
check, intercept the unverified case:

```diff
- if (role === 'clinician') {
-   return <ClinicianStackNavigator />;
- }
+ if (role === 'clinician') {
+   if (!clinicianProfile.verified) {
+     return <PendingVerificationScreen />;
+   }
+   return <ClinicianStackNavigator />;
+ }
```

Note: the existing `fetchClinicianProfile` in `AuthContext.tsx` currently
discards the row if `verified === false` (sets `clinicianProfile = null`).
**This must change.** The new logic must keep the row so the AppNavigator can
read `verified` to decide between PendingVerificationScreen and
ClinicianStackNavigator. The `role` derivation also needs to consider
unverified clinicians as `'clinician'`, not `null`.

```diff
  const role: 'patient' | 'clinician' | null =
    clinicianProfile ? 'clinician' : profile ? 'patient' : null;
```

The derivation stays the same — but `clinicianProfile` will now be populated
even when unverified. We need to make sure no existing screen assumes
`clinicianProfile !== null` implies `verified === true`. Quick grep before
changing the AuthContext logic.

## Backend changes

### Supabase Auth config

- Set `mailer_autoconfirm = false` in the project's Auth settings.
  **This affects patients too.** That means patient sign-up will also require
  email confirmation going forward. This was previously toggled ON for
  earlier debugging; confirm with the orchestrator before flipping.
- Configure the email template + redirect URL so the confirm link lands the
  user back in the app (mobile: deep link; web: a CF Pages route).

### Database

**No schema migration needed.** `clinician_profiles` already has
`full_name`, `license_number`, `hospital_affiliation`, `verified`. Insert at
sign-up uses those columns; admin verification flips `verified = true` +
`verified_at = now()` from the dashboard SQL editor.

### RLS

The existing `clinician_profiles` policies allow self-read and self-update.
Self-insert needs to be confirmed — if there isn't an insert policy, the
sign-up flow's insert will fail under RLS. Add if missing:

```sql
create policy "Clinicians insert own profile" on public.clinician_profiles
  for insert
  with check (auth.uid() = user_id);
```

(Handoff to `infra` to verify + apply if needed. Migration file:
`supabase/migrations/2026-05-22-clinician-profile-self-insert.sql`.)

## Data flow

1. User opens app → Splash → LoginScreen.
2. Taps "Sign up" → RoleSelectScreen.
3. Taps "I'm a healthcare provider" → ClinicianSignupScreen.
4. Fills form → submits.
   - `supabase.auth.signUp(...)` creates auth user (unconfirmed).
   - `insert into clinician_profiles (user_id, ..., verified: false)`.
5. App shows "Check your email" screen.
6. User clicks confirm link in email → Supabase confirms auth, app deep-links
   back / refreshes the web session.
7. AuthContext `onAuthStateChange` fires → loads `clinicianProfile` (which is
   now populated, `verified=false`).
8. AppNavigator routes to `PendingVerificationScreen`.
9. (Admin path, offline:) admin flips `verified=true` in dashboard.
10. User opens app next → step 7 again, this time `verified=true` → routes to
    `ClinicianStackNavigator`.

## Error handling

| Failure | Behavior |
|---|---|
| Duplicate email | Show Supabase error message inline (existing pattern). |
| Network down on signUp | Show generic "Connection problem, try again" — don't optimistically insert clinician_profiles. |
| Auth succeeds, profile insert fails | Show "Account created but couldn't save profile, please contact support" + log to console. Do NOT leave a dangling auth user without a profile row silently. |
| Email confirm link expired | Supabase returns standard error; LoginScreen surfaces it. Add a "Resend confirmation" link on LoginScreen (small follow-up, NOT blocking v1). |
| User logs in before confirming | Supabase blocks login with "Email not confirmed" — surface verbatim. |
| Admin never approves | User stays on PendingVerificationScreen indefinitely. No automated escalation in v1. |

## i18n

All new copy MUST be added to both `i18n/en.ts` and `i18n/th.ts` and routed
through `t()`. Key namespace `auth.roleSelect.*` and `auth.clinicianSignup.*`
and `auth.pendingVerification.*`. Use existing namespace patterns as a guide.
Thai copy for medical/legal terms: when uncertain, use the English term in
parentheses (existing pattern in `i18n/th.ts`).

Specific Thai concerns:
- "Healthcare provider" → "บุคลากรทางการแพทย์" (matches existing app vocabulary).
- "License number" → "เลขใบประกอบวิชาชีพ".
- "Hospital affiliation" → "โรงพยาบาลที่สังกัด".
- "Pending verification" → "รอการตรวจสอบ".

## Testing (QA tentacle scope after implementation)

**Golden paths:**
- Patient sign-up still works end-to-end (now with email confirm — see Backend
  Changes warning).
- Clinician sign-up with ALL optional fields filled → check email → confirm →
  log in → see PendingVerificationScreen with all fields shown.
- Clinician sign-up with NO optional fields → check email → confirm → log in
  → see PendingVerificationScreen with "+ Add license & hospital" CTA → tap →
  edit screen → save → return to pending screen with new values.

**Edge cases:**
- Duplicate email registration.
- Network failure mid-signup.
- Admin flips `verified=true` while user is on PendingVerificationScreen
  (next session — no live-refresh expected in v1).
- Existing clinician users (already in DB) must continue to log in correctly
  with no regression.

**Cross-platform:**
- Web (Cloudflare Pages) — confirm Supabase email-confirm redirect lands
  correctly on `app.haemocare.app`.
- Mobile (Expo Go via tunnel + APK) — confirm deep link configuration for
  email confirm.

## Out of scope for v1

- Admin verification UI (admin uses Supabase dashboard).
- Push or in-app notification on verification approval (clinician finds out at
  next login).
- "Resend confirmation email" affordance on LoginScreen (note above — small
  follow-up).
- A user being BOTH patient and clinician (single role per user).
- Hospital domain auto-verify (allow-list).
- Verification status webhook / audit log.

## Files to create / modify

**Create:**
- `src/screens/auth/RoleSelectScreen.tsx`
- `src/screens/auth/ClinicianSignupScreen.tsx`
- `src/screens/auth/PendingVerificationScreen.tsx`
- `src/screens/clinician/ClinicianProfileEditScreen.tsx` (the "add license/hospital" target — only if not already covered by an existing edit screen)
- `supabase/migrations/2026-05-22-clinician-profile-self-insert.sql` (if RLS gap confirmed)

**Modify:**
- `src/navigation/AuthNavigator.tsx` (register two new screens)
- `src/navigation/AppNavigator.tsx` (PendingVerificationScreen branch)
- `src/types/navigation.ts` (RoleSelect, ClinicianSignup, optionally ClinicianProfileEdit param list entries)
- `src/screens/auth/LoginScreen.tsx` (one nav link change)
- `src/contexts/AuthContext.tsx` (keep unverified clinician profile in state instead of nulling it)
- `i18n/en.ts`, `i18n/th.ts` (new namespaces)

**No changes to:**
- `src/config/theme.ts` (use existing tokens — `primary`, `accent`,
  `primaryGradientStart`/`End`, `statusMonitor`, `gold`, `RADIUS.lg`,
  `SHADOWS.card`).
- `src/config/supabase.ts` (no client-side changes; only dashboard config).
- Patient sign-up flow (except indirectly via the global `mailer_autoconfirm`
  flip — flag to QA).

## Open follow-ups (not blockers)

- Decide if patient sign-up should also be force-confirmed, or if we want
  per-role confirmation behavior (would require a different approach — Supabase
  doesn't have per-role mailer config; would need to handle it via a custom
  trigger or by NOT toggling the global flag and instead deciding per signup
  whether to immediately sign the user in).
- Resend-confirmation affordance on LoginScreen.
- Localized email confirmation template (currently English-only on the Supabase side).
