# Emergency Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an emergency-contact feature to HaemoCare: up to 3 patient-managed contacts, a Passport SOS button, and two inline nudges (after an urgent symptom log; on tier-2 overdue) that all converge on one shared action sheet for calling / SMS-ing the contact.

**Architecture:** New `emergency_contacts` table + RLS (patient writes, clinician reads via the existing `is_active_clinician_for` helper). One shared `EmergencyContactSheet` modal component fed by three trigger surfaces. A new Settings screen manages CRUD + priority reordering via a `security definer` RPC that exploits a DEFERRABLE UNIQUE constraint to swap rows atomically. Pure SMS-body templating is split into a tested util.

**Tech stack:** Expo / React Native + react-native-web, Supabase Postgres + RLS, NativeWind / StyleSheet, jest-expo, `Linking` from react-native for `tel:`/`sms:` URLs, no new native deps.

**Spec:** `docs/superpowers/specs/2026-05-14-emergency-contact-design.md`.

**Branching:** Fresh branch off `main`:
```bash
git checkout main && git checkout -b feat/emergency-contacts
```

---

## File Map

**Create:**
- `HaemoCare/supabase/migrations/2026-05-14_emergency_contacts.sql`
- `HaemoCare/src/services/emergencyContactsService.ts`
- `HaemoCare/src/hooks/useEmergencyContacts.ts`
- `HaemoCare/src/utils/emergencySms.ts`
- `HaemoCare/src/utils/__tests__/emergencySms.test.ts`
- `HaemoCare/src/components/emergency/EmergencyContactSheet.tsx`
- `HaemoCare/src/components/emergency/EmergencySosButton.tsx`
- `HaemoCare/src/screens/settings/EmergencyContactsScreen.tsx`

**Modify:**
- `HaemoCare/supabase/schema.sql` — append the table block
- `HaemoCare/src/types/database.ts` — add `EmergencyContact` + `EmergencyContext` types
- `HaemoCare/src/types/navigation.ts` — register `EmergencyContacts` route
- `HaemoCare/src/navigation/AppNavigator.tsx` — add the route to the root stack
- `HaemoCare/src/mock/services.ts` — add mock implementations
- `HaemoCare/src/i18n/en.ts`, `HaemoCare/src/i18n/th.ts` — 23 new keys
- `HaemoCare/src/screens/tabs/PassportScreen.tsx` — render `<EmergencySosButton>` below the hero
- `HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx` — urgent-log notify nudge
- `HaemoCare/src/components/common/OverdueBanner.tsx` — add optional `onPressNotify` prop
- `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx` — pass `onPressNotify` when tier-2
- `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx` — pass `onPressNotify` when tier-2

---

## Task 1: DB migration + schema + types

**Files:**
- Create: `HaemoCare/supabase/migrations/2026-05-14_emergency_contacts.sql`
- Modify: `HaemoCare/supabase/schema.sql`, `HaemoCare/src/types/database.ts`

- [ ] **Step 1: Create the migration file**

Path: `HaemoCare/supabase/migrations/2026-05-14_emergency_contacts.sql`

```sql
-- Per-patient emergency contacts (up to 3, priority-ordered).
-- See docs/superpowers/specs/2026-05-14-emergency-contact-design.md.

create table public.emergency_contacts (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  phone text not null check (length(phone) >= 9),
  role_label text not null default '',
  priority integer not null default 1 check (priority between 1 and 3),
  created_at timestamptz default now(),
  constraint emergency_contacts_user_priority_unique
    unique (user_id, priority) deferrable initially deferred
);
create index idx_emergency_contacts_user
  on public.emergency_contacts(user_id, priority);

alter table public.emergency_contacts enable row level security;

create policy "Users manage own emergency contacts"
  on public.emergency_contacts
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Clinicians read assigned emergency contacts"
  on public.emergency_contacts
  for select
  using (public.is_active_clinician_for(user_id));

-- Atomic priority swap. DEFERRABLE UNIQUE on (user_id, priority) lets the
-- single UPDATE with a CASE expression succeed without temp-value gymnastics.
create or replace function public.swap_emergency_contact_priorities(
  a_id uuid, b_id uuid
)
returns void language plpgsql security definer set search_path = public as $$
declare
  a_user uuid; b_user uuid;
  a_prio integer; b_prio integer;
begin
  select user_id, priority into a_user, a_prio
    from emergency_contacts where id = a_id for update;
  select user_id, priority into b_user, b_prio
    from emergency_contacts where id = b_id for update;
  if a_user is null or b_user is null then
    raise exception 'contact not found';
  end if;
  if a_user <> auth.uid() or b_user <> auth.uid() then
    raise exception 'not authorized';
  end if;
  update emergency_contacts
    set priority = case
      when id = a_id then b_prio
      when id = b_id then a_prio
      else priority
    end
    where id in (a_id, b_id);
end;
$$;
```

- [ ] **Step 2: Mirror the table block in `schema.sql`**

In `HaemoCare/supabase/schema.sql`, after the existing `clinician_patient_links` block (or wherever the last `create table` lives before the `-- ============ INDEXES` divider), append the entire body of `2026-05-14_emergency_contacts.sql`. Schema-as-truth files include both the table + the function so a from-scratch setup produces an identical DB.

- [ ] **Step 3: Add the TypeScript type**

In `HaemoCare/src/types/database.ts`, append before the existing `export type Outcome` line:

```typescript
export interface EmergencyContact {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  role_label: string;
  priority: 1 | 2 | 3;
  created_at: string;
}

export type EmergencyContext = 'sos' | 'urgent_symptom' | 'overdue';
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 5: Commit**

```bash
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/supabase/migrations/2026-05-14_emergency_contacts.sql \
        HaemoCare/supabase/schema.sql \
        HaemoCare/src/types/database.ts
git commit -m "feat(db): add emergency_contacts table + swap RPC"
```

---

## Task 2: SMS body util + unit tests (TDD)

**Files:**
- Create: `HaemoCare/src/utils/__tests__/emergencySms.test.ts`
- Create: `HaemoCare/src/utils/emergencySms.ts`

- [ ] **Step 1: Write the failing test file**

Path: `HaemoCare/src/utils/__tests__/emergencySms.test.ts`

```typescript
import { buildSmsBody, digitsOnly, isValidPhone } from '../emergencySms';

// Minimal t() shim — returns the key with {placeholders} substituted.
function makeT(): (key: string, params?: Record<string, string | number>) => string {
  const dict: Record<string, string> = {
    'emergency.body.sos': '{name} needs help — sent from HaemoCare.',
    'emergency.body.urgentSymptom': '{name} just logged an urgent symptom in HaemoCare. Please check in.',
    'emergency.body.overdue': '{name} is {days} days overdue for their planned transfusion visit. Please remind them to book.',
  };
  return (key, params) => {
    let s = dict[key] ?? key;
    if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
    return s;
  };
}

describe('buildSmsBody', () => {
  const t = makeT();

  it('builds the SOS body with the patient name', () => {
    expect(buildSmsBody({ context: 'sos', patientName: 'Somchai', t: t as any }))
      .toBe('Somchai needs help — sent from HaemoCare.');
  });

  it('builds the urgent-symptom body with the patient name', () => {
    expect(buildSmsBody({ context: 'urgent_symptom', patientName: 'Niran', t: t as any }))
      .toBe('Niran just logged an urgent symptom in HaemoCare. Please check in.');
  });

  it('builds the overdue body with name + days', () => {
    expect(buildSmsBody({ context: 'overdue', patientName: 'Areeya', daysOverdue: 25, t: t as any }))
      .toBe('Areeya is 25 days overdue for their planned transfusion visit. Please remind them to book.');
  });

  it('falls back to 0 days when daysOverdue is missing in overdue context', () => {
    expect(buildSmsBody({ context: 'overdue', patientName: 'Boon', t: t as any }))
      .toBe('Boon is 0 days overdue for their planned transfusion visit. Please remind them to book.');
  });
});

describe('digitsOnly', () => {
  it('strips spaces, dashes, parens, plus signs', () => {
    expect(digitsOnly('+66 (81) 234-5678')).toBe('66812345678');
  });

  it('leaves a clean number alone', () => {
    expect(digitsOnly('0812345678')).toBe('0812345678');
  });

  it('returns empty string for letters-only input', () => {
    expect(digitsOnly('abc')).toBe('');
  });
});

describe('isValidPhone', () => {
  it('accepts 9 or more digits', () => {
    expect(isValidPhone('081234567')).toBe(true);
    expect(isValidPhone('0812345678')).toBe(true);
    expect(isValidPhone('+66 81 234 5678')).toBe(true);
  });

  it('rejects fewer than 9 digits', () => {
    expect(isValidPhone('12345678')).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('abc')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test -- --testPathPattern=emergencySms
```
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the util**

Path: `HaemoCare/src/utils/emergencySms.ts`

```typescript
import type { TranslationKey } from '../i18n';
import type { EmergencyContext } from '../types/database';

export interface BuildSmsBodyArgs {
  context: EmergencyContext;
  patientName: string;
  daysOverdue?: number;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
}

export function buildSmsBody(args: BuildSmsBodyArgs): string {
  switch (args.context) {
    case 'sos':
      return args.t('emergency.body.sos' as TranslationKey, { name: args.patientName });
    case 'urgent_symptom':
      return args.t('emergency.body.urgentSymptom' as TranslationKey, { name: args.patientName });
    case 'overdue':
      return args.t('emergency.body.overdue' as TranslationKey, {
        name: args.patientName,
        days: args.daysOverdue ?? 0,
      });
  }
}

export function digitsOnly(input: string): string {
  return (input || '').replace(/\D/g, '');
}

export function isValidPhone(input: string): boolean {
  return digitsOnly(input).length >= 9;
}
```

- [ ] **Step 4: Run to verify pass**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test -- --testPathPattern=emergencySms
```
Expected: PASS, 9/9 tests green.

- [ ] **Step 5: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/utils/emergencySms.ts HaemoCare/src/utils/__tests__/emergencySms.test.ts
git commit -m "feat(emergency): add buildSmsBody + phone utils + tests"
```

---

## Task 3: Real + mock services

**Files:**
- Create: `HaemoCare/src/services/emergencyContactsService.ts`
- Modify: `HaemoCare/src/mock/services.ts`

- [ ] **Step 1: Create the real service**

Path: `HaemoCare/src/services/emergencyContactsService.ts`

```typescript
import { supabase } from '../config/supabase';
import type { EmergencyContact } from '../types/database';

export async function listEmergencyContacts(userId: string): Promise<EmergencyContact[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('*')
    .eq('user_id', userId)
    .order('priority', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as EmergencyContact[];
}

export async function addEmergencyContact(
  userId: string,
  input: { name: string; phone: string; role_label: string; priority: 1 | 2 | 3 }
): Promise<EmergencyContact> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .insert({ user_id: userId, ...input })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmergencyContact;
}

export async function updateEmergencyContact(
  id: string,
  input: Partial<Pick<EmergencyContact, 'name' | 'phone' | 'role_label'>>
): Promise<EmergencyContact> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .update(input)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as EmergencyContact;
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('emergency_contacts')
    .delete()
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function swapEmergencyContactPriorities(aId: string, bId: string): Promise<void> {
  const { error } = await supabase.rpc('swap_emergency_contact_priorities', {
    a_id: aId,
    b_id: bId,
  });
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 2: Extend mock services**

Read `HaemoCare/src/mock/services.ts` first to see the existing pattern. Then append at the bottom:

```typescript
// ── Emergency contacts (mock) ──────────────────────────────────

let mockEmergencyContacts: EmergencyContact[] = [];
let mockEmergencyContactIdCounter = 1;

export async function listEmergencyContacts(_userId: string): Promise<EmergencyContact[]> {
  return [...mockEmergencyContacts].sort((a, b) => a.priority - b.priority);
}

export async function addEmergencyContact(
  userId: string,
  input: { name: string; phone: string; role_label: string; priority: 1 | 2 | 3 }
): Promise<EmergencyContact> {
  // Reject if the priority slot is taken.
  if (mockEmergencyContacts.some(c => c.priority === input.priority)) {
    throw new Error(`Priority ${input.priority} already taken`);
  }
  if (mockEmergencyContacts.length >= 3) {
    throw new Error('Maximum 3 contacts');
  }
  const row: EmergencyContact = {
    id: `mock-ec-${mockEmergencyContactIdCounter++}`,
    user_id: userId,
    name: input.name,
    phone: input.phone,
    role_label: input.role_label,
    priority: input.priority,
    created_at: new Date().toISOString(),
  };
  mockEmergencyContacts.push(row);
  return row;
}

export async function updateEmergencyContact(
  id: string,
  input: Partial<Pick<EmergencyContact, 'name' | 'phone' | 'role_label'>>
): Promise<EmergencyContact> {
  const idx = mockEmergencyContacts.findIndex(c => c.id === id);
  if (idx === -1) throw new Error('Contact not found');
  mockEmergencyContacts[idx] = { ...mockEmergencyContacts[idx], ...input };
  return mockEmergencyContacts[idx];
}

export async function deleteEmergencyContact(id: string): Promise<void> {
  mockEmergencyContacts = mockEmergencyContacts.filter(c => c.id !== id);
}

export async function swapEmergencyContactPriorities(aId: string, bId: string): Promise<void> {
  const a = mockEmergencyContacts.find(c => c.id === aId);
  const b = mockEmergencyContacts.find(c => c.id === bId);
  if (!a || !b) throw new Error('Contact not found');
  const aPrio = a.priority;
  a.priority = b.priority;
  b.priority = aPrio;
}
```

Ensure `EmergencyContact` is imported at the top of `services.ts` from `../types/database`.

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/services/emergencyContactsService.ts HaemoCare/src/mock/services.ts
git commit -m "feat(emergency): add real + mock CRUD services"
```

---

## Task 4: i18n strings (EN + Thai)

**Files:**
- Modify: `HaemoCare/src/i18n/en.ts`, `HaemoCare/src/i18n/th.ts`

- [ ] **Step 1: Append a new section to `en.ts`**

In `HaemoCare/src/i18n/en.ts`, near the bottom (before the closing `} as const;`), add:

```typescript
  // Emergency contacts
  'emergency.sos': 'SOS',
  'emergency.sosAddFirst': '+ Add emergency contact',
  'emergency.sheet.title': 'Emergency contacts',
  'emergency.sheet.subtitle.sos': 'Tap to call or message',
  'emergency.sheet.subtitle.urgent': 'Notify someone about this urgent symptom',
  'emergency.sheet.subtitle.overdue': 'Notify someone you are overdue',
  'emergency.sheet.cancel': 'Cancel',
  'emergency.action.call': 'Call',
  'emergency.action.sms': 'SMS',
  'emergency.body.sos': '{name} needs help — sent from HaemoCare.',
  'emergency.body.urgentSymptom': '{name} just logged an urgent symptom in HaemoCare. Please check in.',
  'emergency.body.overdue': '{name} is {days} days overdue for their planned transfusion visit. Please remind them to book.',
  'emergency.notifyPrompt': 'This is an urgent symptom. Notify your caretaker?',
  'emergency.notifyAction': 'Notify',
  'emergency.notifyDismiss': 'Dismiss',
  'emergency.settings.title': 'Emergency contacts',
  'emergency.settings.subtitle': 'Up to 3 people. Used by the SOS button and urgent-symptom alerts.',
  'emergency.settings.addSlot': '+ Add contact (priority {n})',
  'emergency.settings.roleCaretaker': 'Caretaker',
  'emergency.settings.roleDoctor': 'Doctor',
  'emergency.settings.roleOther': 'Other',
  'emergency.errors.noSms': 'No SMS app available on this device.',
  'emergency.errors.invalidPhone': 'Phone number too short. At least 9 digits required.',
  'emergency.overdueNotify': 'Notify caretaker',
```

- [ ] **Step 2: Append mirror section to `th.ts`**

```typescript
  // Emergency contacts
  'emergency.sos': 'ฉุกเฉิน',
  'emergency.sosAddFirst': '+ เพิ่มผู้ติดต่อฉุกเฉิน',
  'emergency.sheet.title': 'ผู้ติดต่อฉุกเฉิน',
  'emergency.sheet.subtitle.sos': 'แตะเพื่อโทรหรือส่งข้อความ',
  'emergency.sheet.subtitle.urgent': 'แจ้งใครสักคนเกี่ยวกับอาการรุนแรงนี้',
  'emergency.sheet.subtitle.overdue': 'แจ้งคนใกล้ตัวว่าคุณเลยกำหนดแล้ว',
  'emergency.sheet.cancel': 'ยกเลิก',
  'emergency.action.call': 'โทร',
  'emergency.action.sms': 'ส่งข้อความ',
  'emergency.body.sos': '{name} ต้องการความช่วยเหลือ — ส่งจาก HaemoCare',
  'emergency.body.urgentSymptom': '{name} เพิ่งบันทึกอาการรุนแรงใน HaemoCare กรุณาติดต่อกลับ',
  'emergency.body.overdue': '{name} เลยกำหนดนัดให้เลือดมา {days} วันแล้ว กรุณาเตือนให้จองนัด',
  'emergency.notifyPrompt': 'นี่เป็นอาการรุนแรง แจ้งผู้ดูแลของคุณหรือไม่?',
  'emergency.notifyAction': 'แจ้ง',
  'emergency.notifyDismiss': 'ปิด',
  'emergency.settings.title': 'ผู้ติดต่อฉุกเฉิน',
  'emergency.settings.subtitle': 'สูงสุด 3 คน ใช้สำหรับปุ่มฉุกเฉินและการแจ้งอาการรุนแรง',
  'emergency.settings.addSlot': '+ เพิ่มผู้ติดต่อ (ลำดับที่ {n})',
  'emergency.settings.roleCaretaker': 'ผู้ดูแล',
  'emergency.settings.roleDoctor': 'แพทย์',
  'emergency.settings.roleOther': 'อื่นๆ',
  'emergency.errors.noSms': 'อุปกรณ์นี้ไม่มีแอปส่งข้อความ',
  'emergency.errors.invalidPhone': 'หมายเลขโทรศัพท์สั้นเกินไป ต้องมีอย่างน้อย 9 หลัก',
  'emergency.overdueNotify': 'แจ้งผู้ดูแล',
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/i18n/en.ts HaemoCare/src/i18n/th.ts
git commit -m "feat(i18n): add 24 emergency-contact strings (EN + Thai)"
```

---

## Task 5: `useEmergencyContacts` hook

**Files:**
- Create: `HaemoCare/src/hooks/useEmergencyContacts.ts`

- [ ] **Step 1: Implement the hook**

Path: `HaemoCare/src/hooks/useEmergencyContacts.ts`

```typescript
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import * as realService from '../services/emergencyContactsService';
import * as mockServices from '../mock/services';
import type { EmergencyContact } from '../types/database';

export interface UseEmergencyContactsResult {
  contacts: EmergencyContact[];
  loading: boolean;
  error: Error | null;
  refresh: () => void;
}

export function useEmergencyContacts(): UseEmergencyContactsResult {
  const { user, isMockMode } = useAuth();
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) {
      setContacts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = isMockMode
          ? await mockServices.listEmergencyContacts(userId)
          : await realService.listEmergencyContacts(userId);
        if (!cancelled) setContacts(data);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setContacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, isMockMode, tick]);

  return { contacts, loading, error, refresh };
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/hooks/useEmergencyContacts.ts
git commit -m "feat(emergency): add useEmergencyContacts hook"
```

---

## Task 6: `EmergencyContactSheet` component

**Files:**
- Create: `HaemoCare/src/components/emergency/EmergencyContactSheet.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/emergency/EmergencyContactSheet.tsx`

```typescript
import React from 'react';
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet, Linking, ToastAndroid, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING } from '../../config/theme';
import { buildSmsBody, digitsOnly } from '../../utils/emergencySms';
import type { EmergencyContact, EmergencyContext } from '../../types/database';

export interface EmergencyContactSheetProps {
  visible: boolean;
  onClose: () => void;
  contacts: EmergencyContact[];
  context: EmergencyContext;
  patientName: string;
  daysOverdue?: number;
}

const SUBTITLE_KEY: Record<EmergencyContext, TranslationKey> = {
  sos: 'emergency.sheet.subtitle.sos' as TranslationKey,
  urgent_symptom: 'emergency.sheet.subtitle.urgent' as TranslationKey,
  overdue: 'emergency.sheet.subtitle.overdue' as TranslationKey,
};

function showToast(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert(message);
  }
}

export default function EmergencyContactSheet(props: EmergencyContactSheetProps) {
  const { visible, onClose, contacts, context, patientName, daysOverdue } = props;
  const { t } = useLanguage();

  const handleCall = async (phone: string) => {
    const url = `tel:${digitsOnly(phone)}`;
    try {
      await Linking.openURL(url);
    } catch {
      showToast(t('emergency.errors.noSms' as TranslationKey));
    }
    onClose();
  };

  const handleSms = async (phone: string) => {
    const body = buildSmsBody({ context, patientName, daysOverdue, t });
    const url = `sms:${digitsOnly(phone)}?body=${encodeURIComponent(body)}`;
    try {
      await Linking.openURL(url);
    } catch {
      showToast(t('emergency.errors.noSms' as TranslationKey));
    }
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {/* swallow */}}>
          <Text style={styles.title}>{t('emergency.sheet.title' as TranslationKey)}</Text>
          <Text style={styles.subtitle}>{t(SUBTITLE_KEY[context])}</Text>
          {contacts.map(c => (
            <View key={c.id} style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.name} numberOfLines={1}>{c.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {c.role_label ? `${c.role_label} · ` : ''}{maskPhone(c.phone)}
                </Text>
              </View>
              <TouchableOpacity style={[styles.actionBtn, styles.callBtn]} onPress={() => handleCall(c.phone)} accessibilityLabel={t('emergency.action.call' as TranslationKey)}>
                <Feather name="phone" size={18} color={COLORS.white} />
                <Text style={styles.actionText}>{t('emergency.action.call' as TranslationKey)}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.smsBtn]} onPress={() => handleSms(c.phone)} accessibilityLabel={t('emergency.action.sms' as TranslationKey)}>
                <Feather name="message-square" size={18} color={COLORS.white} />
                <Text style={styles.actionText}>{t('emergency.action.sms' as TranslationKey)}</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('emergency.sheet.cancel' as TranslationKey)}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function maskPhone(phone: string): string {
  const digits = digitsOnly(phone);
  if (digits.length <= 4) return phone;
  return phone.slice(0, 3) + '•••' + phone.slice(-3);
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: SPACING.lg, paddingBottom: SPACING.xl, gap: SPACING.md },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: SPACING.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight ?? '#E4E4E4' },
  col: { flex: 1, gap: 2 },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  meta: { fontSize: 12, color: COLORS.textLight },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm, borderRadius: 10 },
  callBtn: { backgroundColor: COLORS.statusNormal ?? '#0EA572' },
  smsBtn: { backgroundColor: COLORS.primary ?? '#0B6E6E' },
  actionText: { color: COLORS.white, fontSize: 12, fontWeight: '700' },
  cancel: { alignSelf: 'center', paddingVertical: SPACING.sm, paddingHorizontal: SPACING.lg, marginTop: SPACING.sm },
  cancelText: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/emergency/EmergencyContactSheet.tsx
git commit -m "feat(ui): add EmergencyContactSheet shared component"
```

---

## Task 7: `EmergencySosButton` component

**Files:**
- Create: `HaemoCare/src/components/emergency/EmergencySosButton.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/components/emergency/EmergencySosButton.tsx`

```typescript
import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import { COLORS, SPACING } from '../../config/theme';
import EmergencyContactSheet from './EmergencyContactSheet';
import type { EmergencyContact } from '../../types/database';
import type { RootStackParamList } from '../../types/navigation';

export interface EmergencySosButtonProps {
  contacts: EmergencyContact[];
  patientName: string;
}

export default function EmergencySosButton({ contacts, patientName }: EmergencySosButtonProps) {
  const { t } = useLanguage();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [sheetVisible, setSheetVisible] = useState(false);
  const hasContacts = contacts.length > 0;

  if (!hasContacts) {
    return (
      <TouchableOpacity
        style={styles.buttonEmpty}
        onPress={() => navigation.navigate('EmergencyContacts')}
        activeOpacity={0.8}
      >
        <Feather name="plus-circle" size={18} color={COLORS.statusUrgent ?? '#DC3B3B'} />
        <Text style={styles.textEmpty}>{t('emergency.sosAddFirst' as TranslationKey)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={styles.buttonFull}
        onPress={() => setSheetVisible(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('emergency.sos' as TranslationKey)}
      >
        <Feather name="phone-call" size={20} color={COLORS.white} />
        <Text style={styles.textFull}>{t('emergency.sos' as TranslationKey)}</Text>
      </TouchableOpacity>
      <EmergencyContactSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        contacts={contacts}
        context="sos"
        patientName={patientName}
      />
    </>
  );
}

const styles = StyleSheet.create({
  buttonFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.statusUrgent ?? '#DC3B3B',
    marginVertical: SPACING.md,
  },
  textFull: { color: COLORS.white, fontSize: 17, fontWeight: '800', letterSpacing: 1 },
  buttonEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.statusUrgent ?? '#DC3B3B',
    backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
    marginVertical: SPACING.md,
  },
  textEmpty: { color: COLORS.statusUrgent ?? '#DC3B3B', fontSize: 13, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/emergency/EmergencySosButton.tsx
git commit -m "feat(ui): add EmergencySosButton (red CTA + empty state)"
```

---

## Task 8: `EmergencyContactsScreen` (Settings CRUD)

**Files:**
- Create: `HaemoCare/src/screens/settings/EmergencyContactsScreen.tsx`

- [ ] **Step 1: Implement**

Path: `HaemoCare/src/screens/settings/EmergencyContactsScreen.tsx`

```typescript
import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, SafeAreaView, ScrollView, Modal, Alert, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
import { isValidPhone } from '../../utils/emergencySms';
import * as realService from '../../services/emergencyContactsService';
import * as mockServices from '../../mock/services';
import { COLORS, SPACING } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import type { EmergencyContact } from '../../types/database';

type Role = 'caretaker' | 'doctor' | 'other';
const ROLE_KEYS: Record<Role, TranslationKey> = {
  caretaker: 'emergency.settings.roleCaretaker' as TranslationKey,
  doctor: 'emergency.settings.roleDoctor' as TranslationKey,
  other: 'emergency.settings.roleOther' as TranslationKey,
};

export default function EmergencyContactsScreen() {
  const { user, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { contacts, refresh } = useEmergencyContacts();
  const [editing, setEditing] = useState<{ priority: 1 | 2 | 3; existing?: EmergencyContact } | null>(null);

  const svc = isMockMode ? mockServices : realService;

  const slot = (priority: 1 | 2 | 3) => contacts.find(c => c.priority === priority);

  const handleDelete = useCallback((c: EmergencyContact) => {
    Alert.alert('Delete contact', `Remove ${c.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await svc.deleteEmergencyContact(c.id);
          refresh();
        },
      },
    ]);
  }, [svc, refresh]);

  const handleMove = useCallback(async (from: EmergencyContact, dir: -1 | 1) => {
    const targetPriority = (from.priority + dir) as 1 | 2 | 3;
    if (targetPriority < 1 || targetPriority > 3) return;
    const swapWith = contacts.find(c => c.priority === targetPriority);
    if (!swapWith) return; // can't move into an empty slot via swap; user should add there directly
    await svc.swapEmergencyContactPriorities(from.id, swapWith.id);
    refresh();
  }, [contacts, svc, refresh]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t('emergency.settings.title' as TranslationKey)}</Text>
        <Text style={styles.subtitle}>{t('emergency.settings.subtitle' as TranslationKey)}</Text>

        {([1, 2, 3] as const).map((priority) => {
          const c = slot(priority);
          if (!c) {
            return (
              <TouchableOpacity key={priority} style={styles.emptySlot} onPress={() => setEditing({ priority })}>
                <Feather name="plus" size={16} color={COLORS.primary ?? '#0B6E6E'} />
                <Text style={styles.emptyText}>
                  {t('emergency.settings.addSlot' as TranslationKey, { n: priority })}
                </Text>
              </TouchableOpacity>
            );
          }
          return (
            <View key={c.id} style={styles.filledSlot}>
              <View style={styles.filledLeft}>
                <Text style={styles.slotName}>{c.name}</Text>
                <Text style={styles.slotMeta}>{c.role_label || '—'} · {c.phone}</Text>
              </View>
              <View style={styles.actions}>
                {priority > 1 && (
                  <TouchableOpacity onPress={() => handleMove(c, -1)} accessibilityLabel="Move up">
                    <Feather name="arrow-up" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                )}
                {priority < 3 && (
                  <TouchableOpacity onPress={() => handleMove(c, 1)} accessibilityLabel="Move down">
                    <Feather name="arrow-down" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setEditing({ priority, existing: c })} accessibilityLabel="Edit">
                  <Feather name="edit-2" size={18} color={COLORS.primary ?? '#0B6E6E'} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(c)} accessibilityLabel="Delete">
                  <Feather name="trash-2" size={18} color={COLORS.statusUrgent ?? '#DC3B3B'} />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </ScrollView>

      {editing && (
        <ContactFormModal
          priority={editing.priority}
          existing={editing.existing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
          userId={user?.id ?? ''}
          isMockMode={isMockMode}
        />
      )}
    </SafeAreaView>
  );
}

interface ContactFormModalProps {
  priority: 1 | 2 | 3;
  existing?: EmergencyContact;
  userId: string;
  isMockMode: boolean;
  onClose: () => void;
  onSaved: () => void;
}

function ContactFormModal({ priority, existing, userId, isMockMode, onClose, onSaved }: ContactFormModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [role, setRole] = useState<Role>(
    existing?.role_label === 'Doctor' || existing?.role_label === 'แพทย์' ? 'doctor'
      : existing?.role_label === 'Caretaker' || existing?.role_label === 'ผู้ดูแล' ? 'caretaker'
      : 'other'
  );
  const [customRole, setCustomRole] = useState(role === 'other' ? existing?.role_label ?? '' : '');
  const [error, setError] = useState<string | null>(null);
  const svc = isMockMode
    ? (require('../../mock/services') as typeof mockServices)
    : (require('../../services/emergencyContactsService') as typeof realService);

  const handleSave = async () => {
    if (!name.trim()) { setError('Name is required'); return; }
    if (!isValidPhone(phone)) { setError(t('emergency.errors.invalidPhone' as TranslationKey)); return; }
    const role_label = role === 'other' ? customRole.trim() : t(ROLE_KEYS[role]);
    try {
      if (existing) {
        await svc.updateEmergencyContact(existing.id, { name: name.trim(), phone: phone.trim(), role_label });
      } else {
        await svc.addEmergencyContact(userId, { name: name.trim(), phone: phone.trim(), role_label, priority });
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {existing ? 'Edit contact' : `Add contact (priority ${priority})`}
          </Text>
          <Text style={styles.label}>Name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" />
          <Text style={styles.label}>Phone</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="0812345678" keyboardType="phone-pad" />
          <Text style={styles.label}>Role</Text>
          <View style={styles.chipRow}>
            {(['caretaker', 'doctor', 'other'] as Role[]).map(r => (
              <TouchableOpacity key={r} style={[styles.chip, role === r && styles.chipActive]} onPress={() => setRole(r)}>
                <Text style={[styles.chipText, role === r && styles.chipTextActive]}>{t(ROLE_KEYS[r])}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {role === 'other' && (
            <TextInput style={styles.input} value={customRole} onChangeText={setCustomRole} placeholder="Custom role" />
          )}
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSave} onPress={handleSave}>
              <Text style={styles.modalSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { padding: SPACING.lg, gap: SPACING.md },
  title: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textLight, marginBottom: SPACING.md },
  emptySlot: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed',
    borderColor: COLORS.borderLight ?? '#E4E4E4',
  },
  emptyText: { color: COLORS.primary ?? '#0B6E6E', fontSize: 13, fontWeight: '600' },
  filledSlot: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF',
    borderWidth: 1, borderColor: COLORS.borderLight ?? '#E4E4E4',
    gap: SPACING.sm,
  },
  filledLeft: { flex: 1, gap: 2 },
  slotName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  slotMeta: { fontSize: 12, color: COLORS.textLight },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: SPACING.lg },
  modalCard: { backgroundColor: COLORS.surfaceElevated ?? '#FFFFFF', borderRadius: 16, padding: SPACING.lg, gap: SPACING.sm },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: SPACING.sm },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textLight, marginTop: SPACING.sm },
  input: {
    borderWidth: 1, borderColor: COLORS.borderLight ?? '#E4E4E4',
    borderRadius: 10, padding: SPACING.sm, fontSize: 14, color: COLORS.text,
  },
  chipRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: 4 },
  chip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    borderRadius: 999, borderWidth: 1, borderColor: COLORS.borderLight ?? '#E4E4E4',
  },
  chipActive: { backgroundColor: COLORS.primaryLight ?? '#E7F4F2', borderColor: COLORS.primary ?? '#0B6E6E' },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.primary ?? '#0B6E6E' },
  errorText: { color: COLORS.statusUrgent ?? '#DC3B3B', fontSize: 12, marginTop: SPACING.sm },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: SPACING.sm, marginTop: SPACING.md },
  modalCancel: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  modalCancelText: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
  modalSave: { backgroundColor: COLORS.primary ?? '#0B6E6E', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 10 },
  modalSaveText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/screens/settings/EmergencyContactsScreen.tsx
git commit -m "feat(emergency): add EmergencyContactsScreen (Settings CRUD)"
```

---

## Task 9: Register `EmergencyContacts` route in navigation

**Files:**
- Modify: `HaemoCare/src/types/navigation.ts`
- Modify: `HaemoCare/src/navigation/AppNavigator.tsx`

- [ ] **Step 1: Add to `RootStackParamList`**

In `HaemoCare/src/types/navigation.ts`, find `RootStackParamList` and add `EmergencyContacts: undefined;` alongside the other route entries. Do not change existing routes.

- [ ] **Step 2: Add to AppNavigator**

In `HaemoCare/src/navigation/AppNavigator.tsx`:

1. Add the import near the other screen imports:
   ```typescript
   import EmergencyContactsScreen from '../screens/settings/EmergencyContactsScreen';
   ```
2. Inside the `<RootStack.Navigator>` block, add a screen entry alongside the existing ones:
   ```tsx
   <RootStack.Screen
     name="EmergencyContacts"
     component={EmergencyContactsScreen}
     options={{ title: t('emergency.settings.title') }}
   />
   ```

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/types/navigation.ts HaemoCare/src/navigation/AppNavigator.tsx
git commit -m "feat(nav): register EmergencyContacts route"
```

---

## Task 10: Render SOS button on Passport

**Files:**
- Modify: `HaemoCare/src/screens/tabs/PassportScreen.tsx`

- [ ] **Step 1: Read the existing structure**

Read `HaemoCare/src/screens/tabs/PassportScreen.tsx` to locate where the passport hero card ends and where to insert the new button.

- [ ] **Step 2: Wire up the hook + render**

At the top, add imports:
```typescript
import EmergencySosButton from '../../components/emergency/EmergencySosButton';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
```

Inside the component, alongside the existing hooks:
```typescript
const { contacts } = useEmergencyContacts();
```

In the JSX, immediately AFTER the existing passport hero card (the dark-teal block with name/blood type) and BEFORE any other content cards, insert:
```tsx
<EmergencySosButton
  contacts={contacts}
  patientName={profile?.full_name?.trim() || profile?.patient_id || ''}
/>
```

If `profile` may be null in the render, guard with `{profile && <EmergencySosButton ... />}`.

- [ ] **Step 3: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/screens/tabs/PassportScreen.tsx
git commit -m "feat(passport): render SOS button below hero card"
```

---

## Task 11: Urgent-log nudge in NewSymptomLog

**Files:**
- Modify: `HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx`

- [ ] **Step 1: Read the existing `step === 'result'` block**

Locate where the `result` step renders the `OutcomeDisplay`.

- [ ] **Step 2: Add imports + hook**

```typescript
import EmergencyContactSheet from '../../components/emergency/EmergencyContactSheet';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
```

Inside the component:
```typescript
const { contacts } = useEmergencyContacts();
const [notifySheetVisible, setNotifySheetVisible] = useState(false);
const [nudgeDismissed, setNudgeDismissed] = useState(false);
```

- [ ] **Step 3: Render the nudge banner**

In the `step === 'result'` JSX, immediately after the existing `OutcomeDisplay` (and inside the same wrapping container), add:

```tsx
{confirmedOutcome === 'urgent' && contacts.length > 0 && !nudgeDismissed && (
  <View style={styles.urgentNotifyBanner}>
    <Text style={styles.urgentNotifyText}>{t('emergency.notifyPrompt' as TranslationKey)}</Text>
    <View style={styles.urgentNotifyActions}>
      <TouchableOpacity style={styles.urgentNotifyPrimary} onPress={() => setNotifySheetVisible(true)}>
        <Text style={styles.urgentNotifyPrimaryText}>{t('emergency.notifyAction' as TranslationKey)}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.urgentNotifyGhost} onPress={() => setNudgeDismissed(true)}>
        <Text style={styles.urgentNotifyGhostText}>{t('emergency.notifyDismiss' as TranslationKey)}</Text>
      </TouchableOpacity>
    </View>
  </View>
)}
<EmergencyContactSheet
  visible={notifySheetVisible}
  onClose={() => setNotifySheetVisible(false)}
  contacts={contacts}
  context="urgent_symptom"
  patientName={profile?.full_name?.trim() || profile?.patient_id || ''}
/>
```

Adjust the `patientName` source to whatever the existing screen has access to (it pulls `profile` from `useAuth`).

- [ ] **Step 4: Add styles**

In the existing `StyleSheet.create`:
```typescript
urgentNotifyBanner: {
  padding: SPACING.md,
  borderRadius: 12,
  backgroundColor: COLORS.statusUrgentBg ?? '#FEF2F2',
  borderWidth: 1,
  borderColor: COLORS.statusUrgent ?? '#DC3B3B',
  gap: SPACING.sm,
  marginTop: SPACING.md,
},
urgentNotifyText: { fontSize: 13, color: COLORS.text, fontWeight: '600' },
urgentNotifyActions: { flexDirection: 'row', gap: SPACING.sm },
urgentNotifyPrimary: { backgroundColor: COLORS.statusUrgent ?? '#DC3B3B', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: 8 },
urgentNotifyPrimaryText: { color: COLORS.white, fontSize: 13, fontWeight: '700' },
urgentNotifyGhost: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
urgentNotifyGhostText: { color: COLORS.textLight, fontSize: 13, fontWeight: '600' },
```

- [ ] **Step 5: Typecheck + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/screens/detail/NewSymptomLogScreen.tsx
git commit -m "feat(symptom-log): notify-caretaker nudge on urgent confirm"
```

---

## Task 12: OverdueBanner tier-2 notify + wire callers

**Files:**
- Modify: `HaemoCare/src/components/common/OverdueBanner.tsx`
- Modify: `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx`
- Modify: `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx`

- [ ] **Step 1: Extend OverdueBanner props**

In `HaemoCare/src/components/common/OverdueBanner.tsx`, update the interface and render:

```typescript
export interface OverdueBannerProps {
  daysOverdue: number;
  variant: 'monitor' | 'appointments';
  onPressCta: () => void;
  onPressNotify?: () => void;
}
```

In the render output, AFTER the existing CTA button, conditionally render:

```tsx
{onPressNotify && (
  <TouchableOpacity onPress={onPressNotify} style={styles.notifyBtn} activeOpacity={0.8}>
    <Text style={styles.notifyText}>{t('emergency.overdueNotify' as TranslationKey)}</Text>
  </TouchableOpacity>
)}
```

Add styles:
```typescript
notifyBtn: {
  alignSelf: 'flex-start',
  paddingHorizontal: SPACING.md,
  paddingVertical: SPACING.sm,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: COLORS.statusUrgent ?? '#DC3B3B',
  marginTop: SPACING.sm,
},
notifyText: { color: COLORS.statusUrgent ?? '#DC3B3B', fontSize: 13, fontWeight: '700' },
```

- [ ] **Step 2: Wire `SymptomMonitorScreen`**

In `HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx`:

1. Add imports:
   ```typescript
   import EmergencyContactSheet from '../../components/emergency/EmergencyContactSheet';
   import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
   ```
2. Inside the component, alongside existing hooks:
   ```typescript
   const { contacts } = useEmergencyContacts();
   const [notifySheetVisible, setNotifySheetVisible] = useState(false);
   ```
3. Modify the existing OverdueBanner render to add `onPressNotify` ONLY when tier-2 + contacts exist:

```tsx
{overdueState?.isOverdue && (
  <OverdueBanner
    daysOverdue={overdueState.daysOverdue}
    variant="monitor"
    onPressCta={() => navigation.navigate('AddAppointment')}
    onPressNotify={
      overdueState.bumpTiers === 2 && contacts.length > 0
        ? () => setNotifySheetVisible(true)
        : undefined
    }
  />
)}
<EmergencyContactSheet
  visible={notifySheetVisible}
  onClose={() => setNotifySheetVisible(false)}
  contacts={contacts}
  context="overdue"
  patientName={profile?.full_name?.trim() || profile?.patient_id || ''}
  daysOverdue={overdueState?.isOverdue ? overdueState.daysOverdue : undefined}
/>
```

`profile` comes from `useAuth()`. Add the destructure if not already present.

- [ ] **Step 3: Wire `AppointmentsScreen`**

Same pattern. In `HaemoCare/src/screens/tabs/AppointmentsScreen.tsx`:

1. Same imports.
2. Same `contacts` + `notifySheetVisible` state.
3. Add `onPressNotify` to its OverdueBanner the same way, and render the sheet.

- [ ] **Step 4: Typecheck + tests + commit**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test
cd /Users/macbook/Desktop/TNDH
git add HaemoCare/src/components/common/OverdueBanner.tsx \
        HaemoCare/src/screens/tabs/SymptomMonitorScreen.tsx \
        HaemoCare/src/screens/tabs/AppointmentsScreen.tsx
git commit -m "feat(overdue): tier-2 notify-caretaker action on banner"
```

---

## Task 13: Final verification

**Files:** none modified.

- [ ] **Step 1: Full test suite**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npm test
```
Expected: 55 + 9 = 64 tests pass (or higher if other tests existed).

- [ ] **Step 2: Typecheck the whole project**

```bash
cd /Users/macbook/Desktop/TNDH/HaemoCare && npx tsc --noEmit
```
Expected: clean.

- [ ] **Step 3: Diff stat**

```bash
cd /Users/macbook/Desktop/TNDH && git diff main..HEAD --stat | tail -5
```
Capture for the PR description.

- [ ] **Step 4: No commit** — verification only.

---

## Self-review

**Spec coverage:**
- Schema + RLS + swap RPC → Task 1 ✓
- `EmergencyContact` + `EmergencyContext` types → Task 1 ✓
- `buildSmsBody` + `digitsOnly` + `isValidPhone` → Task 2 (with tests) ✓
- Real + mock CRUD services + swap RPC ↔ swap fn → Task 3 ✓
- 23 i18n keys EN + Thai → Task 4 (24 actually; added `emergency.overdueNotify` because the OverdueBanner secondary button needs it — small bump from the spec count, called out here) ✓
- `useEmergencyContacts` hook → Task 5 ✓
- `EmergencyContactSheet` shared component → Task 6 ✓
- `EmergencySosButton` (full + empty states) → Task 7 ✓
- `EmergencyContactsScreen` settings page (CRUD + reorder) → Task 8 ✓
- Route registration → Task 9 ✓
- Passport SOS placement → Task 10 ✓
- Urgent-log nudge → Task 11 ✓
- OverdueBanner tier-2 notify + wire two callers → Task 12 ✓
- Verification → Task 13 ✓

**Placeholder scan:** No TBDs, every code block is real, every import path resolves against the file map.

**Type consistency:**
- `EmergencyContact` shape stable across tasks 1, 3, 5, 6, 7, 8, 10, 11, 12 ✓
- `EmergencyContext` literals `'sos' | 'urgent_symptom' | 'overdue'` consistent ✓
- Hook return shape `{ contacts, loading, error, refresh }` consistent in all consumers ✓
- Sheet props consistent across SOS button, NewSymptomLog, SymptomMonitor, AppointmentsScreen call sites ✓

**Known soft spots:**
- Task 8's ContactFormModal uses dynamic `require(...)` for service selection. Cleaner would be passing the service module via props or context. Acceptable for now since the screen is leaf-level and never re-mounted during the same session.
- Task 11 assumes `profile` is available via `useAuth()` in `NewSymptomLogScreen` — check that imports exist before applying.
- Task 12 modifies two tab screens identically; if the subagent diffs them, they'll see they have similar but not-quite-identical structure. Each is a separate edit; do not try to extract a shared component for this small a change.
