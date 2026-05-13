import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
  Modal,
  Alert,
  StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useEmergencyContacts } from '../../hooks/useEmergencyContacts';
import { isValidPhone, digitsOnly } from '../../utils/emergencySms';
import * as realService from '../../services/emergencyContactsService';
import * as mockServices from '../../mock/services';
import { COLORS, SPACING } from '../../config/theme';
import { TranslationKey } from '../../i18n';
import type { EmergencyContact } from '../../types/database';

type Role = 'caretaker' | 'doctor' | 'other';

const ROLE_KEYS: Record<Role, TranslationKey> = {
  caretaker: 'emergency.settings.roleCaretaker',
  doctor: 'emergency.settings.roleDoctor',
  other: 'emergency.settings.roleOther',
};

export default function EmergencyContactsScreen() {
  const { user, isMockMode } = useAuth();
  const { t } = useLanguage();
  const { contacts, refresh } = useEmergencyContacts();
  const [editing, setEditing] = useState<{
    priority: 1 | 2 | 3;
    existing?: EmergencyContact;
  } | null>(null);

  const svc = isMockMode ? mockServices : realService;
  const slot = (priority: 1 | 2 | 3) => contacts.find(c => c.priority === priority);

  const handleDelete = useCallback(
    (c: EmergencyContact) => {
      Alert.alert(t('emergency.settings.deleteConfirmTitle'), t('emergency.settings.deleteConfirmBody', { name: c.name }), [
        { text: t('emergency.settings.cancelAction'), style: 'cancel' },
        {
          text: t('emergency.settings.deleteAction'),
          style: 'destructive',
          onPress: async () => {
            await svc.deleteEmergencyContact(c.id);
            refresh();
          },
        },
      ]);
    },
    [svc, refresh],
  );

  const handleMove = useCallback(
    async (from: EmergencyContact, dir: -1 | 1) => {
      const targetPriority = (from.priority + dir) as 1 | 2 | 3;
      if (targetPriority < 1 || targetPriority > 3) return;
      const swapWith = contacts.find(c => c.priority === targetPriority);
      if (!swapWith) return;
      await svc.swapEmergencyContactPriorities(from.id, swapWith.id);
      refresh();
    },
    [contacts, svc, refresh],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>
          {t('emergency.settings.title')}
        </Text>
        <Text style={styles.subtitle}>
          {t('emergency.settings.subtitle')}
        </Text>

        {([1, 2, 3] as const).map(priority => {
          const c = slot(priority);
          if (!c) {
            return (
              <TouchableOpacity
                key={priority}
                style={styles.emptySlot}
                onPress={() => setEditing({ priority })}
              >
                <Feather name="plus" size={16} color={COLORS.primary} />
                <Text style={styles.emptyText}>
                  {t('emergency.settings.addSlot', { n: priority })}
                </Text>
              </TouchableOpacity>
            );
          }
          return (
            <View key={c.id} style={styles.filledSlot}>
              <View style={styles.filledLeft}>
                <Text style={styles.slotName}>{c.name}</Text>
                <Text style={styles.slotMeta}>
                  {c.role_label || '—'} · {c.phone}
                </Text>
              </View>
              <View style={styles.actions}>
                {priority > 1 && (
                  <TouchableOpacity
                    onPress={() => handleMove(c, -1)}
                    accessibilityLabel={t('emergency.settings.a11yMoveUp')}
                  >
                    <Feather name="arrow-up" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                )}
                {priority < 3 && (
                  <TouchableOpacity
                    onPress={() => handleMove(c, 1)}
                    accessibilityLabel={t('emergency.settings.a11yMoveDown')}
                  >
                    <Feather name="arrow-down" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setEditing({ priority, existing: c })}
                  accessibilityLabel={t('emergency.settings.a11yEdit')}
                >
                  <Feather name="edit-2" size={18} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleDelete(c)}
                  accessibilityLabel={t('emergency.settings.a11yDelete')}
                >
                  <Feather name="trash-2" size={18} color={COLORS.statusUrgent} />
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
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
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

function ContactFormModal({
  priority,
  existing,
  userId,
  isMockMode,
  onClose,
  onSaved,
}: ContactFormModalProps) {
  const { t } = useLanguage();
  const [name, setName] = useState(existing?.name ?? '');
  const [phone, setPhone] = useState(existing?.phone ?? '');
  const [role, setRole] = useState<Role>(() =>
    existing?.role_label === 'Doctor' ? 'doctor'
      : existing?.role_label === 'Caretaker' ? 'caretaker'
      : 'other'
  );
  const [customRole, setCustomRole] = useState(() =>
    existing?.role_label && existing.role_label !== 'Doctor' && existing.role_label !== 'Caretaker'
      ? existing.role_label
      : ''
  );
  const [error, setError] = useState<string | null>(null);
  const svc = isMockMode ? mockServices : realService;

  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('emergency.settings.nameRequired'));
      return;
    }
    if (!isValidPhone(phone)) {
      setError(t('emergency.errors.invalidPhone'));
      return;
    }
    const role_label = role === 'other' ? customRole.trim() : (role === 'caretaker' ? 'Caretaker' : 'Doctor');
    try {
      if (existing) {
        await svc.updateEmergencyContact(existing.id, {
          name: name.trim(),
          phone: digitsOnly(phone),
          role_label,
        });
      } else {
        await svc.addEmergencyContact(userId, {
          name: name.trim(),
          phone: digitsOnly(phone),
          role_label,
          priority,
        });
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
            {existing
              ? t('emergency.settings.editTitle')
              : t('emergency.settings.addTitle', { n: priority })}
          </Text>

          <Text style={styles.label}>{t('emergency.settings.fieldName')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('emergency.settings.fieldNamePlaceholder')}
          />

          <Text style={styles.label}>{t('emergency.settings.fieldPhone')}</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder={t('emergency.settings.fieldPhonePlaceholder')}
            keyboardType="phone-pad"
          />

          <Text style={styles.label}>{t('emergency.settings.fieldRole')}</Text>
          <View style={styles.chipRow}>
            {(['caretaker', 'doctor', 'other'] as Role[]).map(r => (
              <TouchableOpacity
                key={r}
                style={[styles.chip, role === r && styles.chipActive]}
                onPress={() => setRole(r)}
              >
                <Text
                  style={[
                    styles.chipText,
                    role === r && styles.chipTextActive,
                  ]}
                >
                  {t(ROLE_KEYS[r])}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {role === 'other' && (
            <TextInput
              style={styles.input}
              value={customRole}
              onChangeText={setCustomRole}
              placeholder={t('emergency.settings.customRolePlaceholder')}
            />
          )}

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onClose}>
              <Text style={styles.modalCancelText}>{t('emergency.settings.cancelAction')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSave} onPress={handleSave}>
              <Text style={styles.modalSaveText}>{t('emergency.settings.saveAction')}</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.borderLight,
  },
  emptyText: { color: COLORS.primary, fontSize: 13, fontWeight: '600' },
  filledSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceElevated,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: SPACING.sm,
  },
  filledLeft: { flex: 1, gap: 2 },
  slotName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  slotMeta: { fontSize: 12, color: COLORS.textLight },
  actions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surfaceElevated,
    borderRadius: 16,
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textLight,
    marginTop: SPACING.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    borderRadius: 10,
    padding: SPACING.sm,
    fontSize: 14,
    color: COLORS.text,
  },
  chipRow: { flexDirection: 'row', gap: SPACING.xs, marginTop: 4 },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  chipActive: {
    backgroundColor: COLORS.primaryLight,
    borderColor: COLORS.primary,
  },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: COLORS.primary },
  errorText: {
    color: COLORS.statusUrgent,
    fontSize: 12,
    marginTop: SPACING.sm,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  modalCancel: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  modalCancelText: { color: COLORS.textLight, fontSize: 14, fontWeight: '600' },
  modalSave: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 10,
  },
  modalSaveText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
});
