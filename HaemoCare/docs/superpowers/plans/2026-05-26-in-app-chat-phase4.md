# In-App Chat — Phase 4: Push Notifications

## Summary

Extends HaemoCare's chat with Expo push notifications so recipients are
alerted to new messages even when the app is closed.

## Components

### push_tokens table (`supabase/migrations/2026-06-04-push-tokens.sql`)
One row per device token. `user_id` FK → `auth.users`, unique on `token`,
RLS: users manage their own rows only. Not applied automatically — see GATE.

### Token registration (`src/services/notifications.ts` + `src/hooks/usePushRegistration.ts`)
`registerPushToken(userId)` upserts the Expo push token via
`getExpoPushTokenAsync`. Guards: returns early on web (`Platform.OS==='web'`),
mock mode, denied permission, missing projectId, or simulator throw.
`usePushRegistration` hook calls it once per `userId` session. Mounted in
`AppNavigator` — runs for both patient and clinician after auth.

### Edge Function (`supabase/functions/notify-new-message/index.ts`)
Deno function triggered by a Database Webhook on `messages INSERT`. Steps:
1. Parse webhook payload → `record.link_id`, `record.sender_id`.
2. Load `clinician_patient_links` with the service-role key.
3. Derive recipient (the link party that is NOT the sender).
4. Load `push_tokens` for the recipient.
5. POST each token to `https://exp.host/--/api/v2/push/send` with
   `{ title:'HaemoCare', body: record.body ?? '📷 Photo', data:{type:'chat',linkId} }`.
6. Return 200 in all cases (prevents Supabase webhook retry storms on bugs).

### Deep-link routing
- **Patient**: `NotificationGate` (already mounted for patients inside
  `NavigationContainer`) checks `data.type === 'chat'` and navigates to
  `MainTabs` (Messages tab). Direct-to-thread is a future refinement.
- **Clinician**: `useChatNotificationRouting` hook in `ClinicianStackNavigator`
  checks `data.type === 'chat'` and navigates to `ClinicianInbox`.

## GATE — required ops steps before push works end-to-end

1. **Apply migration**: `supabase db push` (or apply `2026-06-04-push-tokens.sql`
   in the Supabase SQL editor).
2. **Deploy Edge Function**: `supabase functions deploy notify-new-message`
3. **Configure Database Webhook** in the Supabase dashboard:
   - Table: `public.messages`, Event: `INSERT`
   - Type: Supabase Edge Function → `notify-new-message`
4. **Test on a real device** (push tokens do not exist on simulators or Expo Go
   iOS; use a development build via EAS Build or TestFlight).
