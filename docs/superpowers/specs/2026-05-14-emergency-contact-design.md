# Emergency Caretaker + Doctor Contact Feature

**Status:** Approved design (2026-05-14). Implementation plan pending.
**Scope:** HaemoCare patient-side feature. Adds three SOS surfaces that all converge on one shared action sheet for calling/SMS-ing a stored contact.

## Problem

A thalassemia patient experiencing a transfusion reaction or feeling unwell needs to reach their caretaker or doctor fast. Today they have to dig through their phone contacts. The app should put the right people one tap away — and proactively offer that tap at the moments when it knows the patient is in a bad state (urgent symptom, severely overdue).

## What we're shipping

- **Manual SOS button** on the Passport screen → opens a sheet listing 1–3 stored emergency contacts, each with Call / SMS buttons.
- **Inline nudge** after a confirmed urgent symptom log → same sheet, prefilled with an urgent-symptom message body.
- **Inline nudge** on the OverdueBanner when `bumpTiers === 2` → same sheet, prefilled with an overdue message body. Tier-1 overdue does NOT show this — only the highest tier warrants pinging a caretaker.
- **Settings screen** to add / edit / delete / reorder up to 3 contacts.

All three triggers reuse one component: `EmergencyContactSheet`.

## Out of scope (v1)

- LINE / WhatsApp / Telegram deep links. Just `tel:` and `sms:`.
- GPS location in the SMS body. (Adds permission + UX surface; defer to v0.2.)
- Push notifications when the patient hasn't opened the app. Auto-alerts are inline banners only.
- Lock-screen Medical-ID-style display. Passport QR already covers the "first responder reads the phone" use case for blood-type/antibody info.
- Automatic linking to a HaemoCare-registered clinician. (`clinician_profiles` doesn't store a phone today; defer the "use my linked clinician" picker to v0.2 when we add `clinician_profiles.phone`.)
- Per-patient setting to auto-fire SMS without confirmation. Always confirm in v1.

## Contacts model

### Schema

```sql
create table public.emergency_contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text not null,
  role_label text not null default '',
  priority integer not null default 1 check (priority between 1 and 3),
  created_at timestamptz default now(),
  unique (user_id, priority)
);
create index idx_emergency_contacts_user on public.emergency_contacts(user_id, priority);

alter table public.emergency_contacts enable row level security;

create policy "Users manage own emergency contacts" on public.emergency_contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Clinicians read assigned emergency contacts" on public.emergency_contacts
  for select using (public.is_active_clinician_for(user_id));
```

- `phone` is free-form text. App-side validation: strip non-digits, require ≥ 9 digits. No E.164 normalization.
- `role_label`: free text, but the Add/Edit UI offers three chips: "Caretaker", "Doctor", "Other". Patient can type their own.
- `priority` is the canonical ordering. SOS sheet renders rows ascending by priority. UNIQUE on `(user_id, priority)` prevents two rows from sharing a slot.

### Priority swap RPC

Two rows reordering would temporarily violate the UNIQUE constraint mid-statement. Two changes make this clean:

1. The UNIQUE on `(user_id, priority)` is declared `DEFERRABLE INITIALLY DEFERRED`, so the constraint is checked at commit time, not after each row update.
2. A `security definer` function performs the swap as a single UPDATE with a CASE expression, then commits.

Replace the inline `unique (user_id, priority)` in the table definition with:

```sql
constraint emergency_contacts_user_priority_unique unique (user_id, priority) deferrable initially deferred
```

Then the RPC:

```sql
create or replace function public.swap_emergency_contact_priorities(a_id uuid, b_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  a_user uuid; b_user uuid;
  a_prio integer; b_prio integer;
begin
  select user_id, priority into a_user, a_prio from emergency_contacts where id = a_id for update;
  select user_id, priority into b_user, b_prio from emergency_contacts where id = b_id for update;
  if a_user is null or b_user is null then raise exception 'contact not found'; end if;
  if a_user <> auth.uid() or b_user <> auth.uid() then raise exception 'not authorized'; end if;
  update emergency_contacts
    set priority = case when id = a_id then b_prio when id = b_id then a_prio else priority end
    where id in (a_id, b_id);
end;
$$;
```

## Components

### `EmergencyContactSheet` (new shared component)

`HaemoCare/src/components/emergency/EmergencyContactSheet.tsx`

```typescript
export type EmergencyContext = 'sos' | 'urgent_symptom' | 'overdue';

export interface EmergencyContactSheetProps {
  visible: boolean;
  onClose: () => void;
  contacts: EmergencyContact[];     // already sorted by priority
  context: EmergencyContext;
  patientName: string;
  daysOverdue?: number;             // required when context === 'overdue'
}
```

Implementation:
- React Native `Modal` with `transparent={true}` + a backdrop `Pressable` for tap-to-close
- Card pinned to the bottom of the screen (`justifyContent: 'flex-end'`)
- Header: "Emergency contacts" + a subtitle that varies by context
- One row per contact: name, role badge, masked phone, `📞 Call` + `💬 SMS` buttons
- `📞` → `await Linking.openURL('tel:' + digitsOnly(phone))`; if rejected, show a toast
- `💬` → `await Linking.openURL('sms:' + digitsOnly(phone) + '?body=' + encodeURIComponent(body))`; if rejected, show toast
- Cancel button at the bottom

### `buildSmsBody` (pure function in `src/utils/emergencySms.ts`)

```typescript
export interface BuildSmsBodyArgs {
  context: EmergencyContext;
  patientName: string;
  daysOverdue?: number;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function buildSmsBody(args: BuildSmsBodyArgs): string {
  switch (args.context) {
    case 'sos':
      return args.t('emergency.body.sos', { name: args.patientName });
    case 'urgent_symptom':
      return args.t('emergency.body.urgentSymptom', { name: args.patientName });
    case 'overdue':
      return args.t('emergency.body.overdue', { name: args.patientName, days: args.daysOverdue ?? 0 });
  }
}
```

Pure, unit-testable. The sheet calls it once per render of the SMS button.

### `EmergencyContactsScreen` (new Settings screen)

`HaemoCare/src/screens/settings/EmergencyContactsScreen.tsx`

- Renders 3 priority slots
- Filled slot row: name · role · masked phone · edit / delete / move-up / move-down icons
- Empty slot row: tap to open the add-contact modal at that priority
- Add/Edit modal: TextInputs for name + phone (digits-stripped + length check); 3-chip selector for role with a "custom" fallback that swaps into a TextInput; Save button
- Reorder uses the swap RPC; move-up swaps with the row above, move-down with the row below
- Delete asks for confirmation, then `delete` query + `refetch`

### Patient-side service

`HaemoCare/src/services/emergencyContactsService.ts`

```typescript
export async function listEmergencyContacts(userId: string): Promise<EmergencyContact[]>
export async function addEmergencyContact(userId: string, input: Omit<EmergencyContact, 'id' | 'user_id' | 'created_at'>): Promise<EmergencyContact>
export async function updateEmergencyContact(id: string, input: Partial<Pick<EmergencyContact, 'name' | 'phone' | 'role_label'>>): Promise<EmergencyContact>
export async function deleteEmergencyContact(id: string): Promise<void>
export async function swapEmergencyContactPriorities(aId: string, bId: string): Promise<void>  // RPC call
```

Mirror these in `src/mock/services.ts` for mock-mode parity. Mock store is a `let contacts: EmergencyContact[] = []` module-level — empty by default; the demo patient can add contacts during a session, they persist for the mock-mode session but reset on reload (matching the existing mock pattern).

### `useEmergencyContacts` hook

`HaemoCare/src/hooks/useEmergencyContacts.ts`

- Reads contacts for the current `auth.user.id`
- Returns `{ contacts: EmergencyContact[], loading: boolean, error: Error | null, refresh: () => void }`
- Auto-refresh on focus via `useFocusEffect` (so Settings changes propagate to the Passport SOS button)
- Mock-mode branching mirrors the existing `useOverdueState` pattern

## Wiring the three triggers

### 1. Passport SOS button

`HaemoCare/src/screens/tabs/PassportScreen.tsx`

Add a row directly below the existing passport hero card:
```tsx
<EmergencySosButton contacts={contacts} patientName={profile.full_name || profile.patient_id} />
```

The button itself:
- If `contacts.length === 0`: render with the `+ Add emergency contact` label, `onPress` navigates to the Emergency Contacts settings screen.
- Else: render the red SOS button. `onPress` sets `sheetVisible = true`. The sheet receives `context="sos"`.

### 2. NewSymptomLog urgent-log nudge

`HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx`

In the `step === 'result'` block, after the existing `OutcomeDisplay`, add (conditional on `confirmedOutcome === 'urgent'` AND `contacts.length > 0`):

```tsx
<View style={styles.urgentNotifyBanner}>
  <Text>{t('emergency.notifyPrompt')}</Text>
  <View style={styles.row}>
    <Button onPress={() => setSheetVisible(true)}>{t('emergency.notifyAction')}</Button>
    <Button variant="ghost" onPress={() => setNudgeDismissed(true)}>{t('emergency.notifyDismiss')}</Button>
  </View>
</View>
{sheetVisible && (
  <EmergencyContactSheet ... context="urgent_symptom" />
)}
```

### 3. OverdueBanner tier-2 nudge

`HaemoCare/src/components/common/OverdueBanner.tsx`

Accept an optional `onPressNotify?: () => void` prop. When the prop is provided, render a secondary outline button below the existing CTA: `[Notify caretaker]`. When omitted, render the existing single-button UI — backward compatible.

The banner does NOT inspect `bumpTiers` itself — the caller decides whether to surface the notify action. Two callers (`SymptomMonitorScreen`, `AppointmentsScreen`) pass `onPressNotify` only when `overdueState.bumpTiers === 2`, and that handler opens the shared sheet with `context="overdue"` + `daysOverdue` from `overdueState`.

## i18n keys (new)

Add to `en.ts` and `th.ts`:

```typescript
'emergency.sos': 'SOS' | 'ฉุกเฉิน'
'emergency.sosAddFirst': '+ Add emergency contact' | '+ เพิ่มผู้ติดต่อฉุกเฉิน'
'emergency.sheet.title': 'Emergency contacts' | 'ผู้ติดต่อฉุกเฉิน'
'emergency.sheet.subtitle.sos': 'Tap to call or message' | 'แตะเพื่อโทรหรือส่งข้อความ'
'emergency.sheet.subtitle.urgent': 'Notify someone about this urgent symptom' | 'แจ้งใครสักคนเกี่ยวกับอาการรุนแรงนี้'
'emergency.sheet.subtitle.overdue': 'Notify someone you are overdue' | 'แจ้งคนใกล้ตัวว่าคุณเลยกำหนดแล้ว'
'emergency.sheet.cancel': 'Cancel' | 'ยกเลิก'
'emergency.action.call': 'Call' | 'โทร'
'emergency.action.sms': 'SMS' | 'ส่งข้อความ'
'emergency.body.sos': '{name} needs help — sent from HaemoCare.' | '{name} ต้องการความช่วยเหลือ — ส่งจาก HaemoCare'
'emergency.body.urgentSymptom': '{name} just logged an urgent symptom in HaemoCare. Please check in.' | '{name} เพิ่งบันทึกอาการรุนแรงใน HaemoCare กรุณาติดต่อกลับ'
'emergency.body.overdue': '{name} is {days} days overdue for their planned transfusion visit. Please remind them to book.' | '{name} เลยกำหนดนัดให้เลือดมา {days} วันแล้ว กรุณาเตือนให้จองนัด'
'emergency.notifyPrompt': 'This is an urgent symptom. Notify your caretaker?' | 'นี่เป็นอาการรุนแรง แจ้งผู้ดูแลของคุณหรือไม่?'
'emergency.notifyAction': 'Notify' | 'แจ้ง'
'emergency.notifyDismiss': 'Dismiss' | 'ปิด'
'emergency.settings.title': 'Emergency contacts' | 'ผู้ติดต่อฉุกเฉิน'
'emergency.settings.subtitle': 'Up to 3 people. Used by the SOS button and urgent-symptom alerts.' | 'สูงสุด 3 คน ใช้สำหรับปุ่มฉุกเฉินและการแจ้งอาการรุนแรง'
'emergency.settings.addSlot': '+ Add contact (priority {n})' | '+ เพิ่มผู้ติดต่อ (ลำดับที่ {n})'
'emergency.settings.roleCaretaker': 'Caretaker' | 'ผู้ดูแล'
'emergency.settings.roleDoctor': 'Doctor' | 'แพทย์'
'emergency.settings.roleOther': 'Other' | 'อื่นๆ'
'emergency.errors.noSms': 'No SMS app available on this device.' | 'อุปกรณ์นี้ไม่มีแอปส่งข้อความ'
'emergency.errors.invalidPhone': 'Phone number too short. At least 9 digits required.' | 'หมายเลขโทรศัพท์สั้นเกินไป ต้องมีอย่างน้อย 9 หลัก'
```

## Testing

- **Unit:** `buildSmsBody` table-driven (3 contexts × 1 happy path × edge: missing daysOverdue with `context='overdue'`)
- **Unit:** phone digit-stripping helper (`digitsOnly`) — strip spaces, dashes, parens, plus signs
- **Smoke:** `EmergencyContactSheet` renders the right number of rows given 0, 1, 2, 3 contacts; tapping outside dismisses
- **Smoke:** `useEmergencyContacts` returns the mock contacts in mock mode, real query in real mode
- **Manual on Android device:**
  - Add 3 contacts via Settings → reorder → delete → verify priorities update
  - Tap Passport SOS → sheet appears → tap Call → real dialer opens with the number → cancel
  - Tap Passport SOS → tap SMS → real Messages app opens with body filled → cancel
  - Log a fever-7 + chills-6 symptom → confirm urgent on review step → on result step, the Notify banner appears → tap Notify → sheet opens with urgent_symptom body
  - Trip tier-2 overdue (interval=7, last tx 30+ days ago) → OverdueBanner shows `[Notify caretaker]` → tap → sheet opens with overdue body

## File map

**Create:**
- `HaemoCare/supabase/migrations/2026-05-14_emergency_contacts.sql`
- `HaemoCare/src/components/emergency/EmergencyContactSheet.tsx`
- `HaemoCare/src/components/emergency/EmergencySosButton.tsx`
- `HaemoCare/src/screens/settings/EmergencyContactsScreen.tsx`
- `HaemoCare/src/services/emergencyContactsService.ts`
- `HaemoCare/src/hooks/useEmergencyContacts.ts`
- `HaemoCare/src/utils/emergencySms.ts`
- `HaemoCare/src/utils/__tests__/emergencySms.test.ts`

**Modify:**
- `HaemoCare/supabase/schema.sql` — append the new table block
- `HaemoCare/src/types/database.ts` — add `EmergencyContact` interface
- `HaemoCare/src/types/navigation.ts` — register `EmergencyContacts` route
- `HaemoCare/src/navigation/AppNavigator.tsx` — add the route to the stack
- `HaemoCare/src/screens/tabs/PassportScreen.tsx` — drop in `<EmergencySosButton>` below the hero
- `HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx` — urgent-log nudge in `step === 'result'`
- `HaemoCare/src/components/common/OverdueBanner.tsx` — accept optional `onPressNotify` prop; render secondary button for tier-2
- `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx` — pass `onPressNotify` to OverdueBanner
- `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx` — same
- `HaemoCare/src/mock/services.ts` — add mock implementations of the 5 service functions + RPC swap
- `HaemoCare/src/i18n/en.ts`, `HaemoCare/src/i18n/th.ts` — 23 new keys

## Assumptions worth flagging

1. **Phone numbers stored as user typed.** No libphonenumber. Works for `tel:`/`sms:` because the OS handles formatting at dial time.
2. **Clinician read access via `is_active_clinician_for`.** When a clinician opens a patient detail pane, they can see the caretaker's number. If you'd rather emergency contacts stay strictly patient-private, drop the clinician policy.
3. **No automatic clinician-link integration.** Patients enter their doctor's number manually. v0.2 can add a "use my linked clinician" picker once `clinician_profiles.phone` exists.
4. **Auto-alerts are inline banners only.** No push notifications, no background scheduling. Patient sees them only when they're in the app.
5. **Tier-1 overdue does NOT show the notify nudge.** Only tier-2 (≥22 days). Tier-1 is still actionable but not emergency-grade.
6. **SOS sheet is a modal, not a separate screen.** Faster to dismiss, easier to backdrop-tap-close. Native React Navigation doesn't offer a stable bottom-sheet primitive without extra deps; we use `Modal` to avoid adding `@gorhom/bottom-sheet`.
