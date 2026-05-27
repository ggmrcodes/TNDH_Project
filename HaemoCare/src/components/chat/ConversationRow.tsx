import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { Conversation } from '../../types/database';
import ChatAvatar from './ChatAvatar';

interface Props { conversation: Conversation; onPress: () => void; }

export default function ConversationRow({ conversation: c, onPress }: Props) {
  const { t, language } = useLanguage();
  const unread = c.unreadCount > 0;
  const isPhoto = c.lastMessage === '📷';
  const time = c.lastMessageAt
    ? new Date(c.lastMessageAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' })
    : '';

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={styles.row}>
      <ChatAvatar name={c.otherPartyName} size={48} />
      <View style={styles.col}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>{c.otherPartyName}</Text>
          {time ? <Text style={[styles.time, unread && styles.timeUnread]}>{time}</Text> : null}
        </View>
        <View style={styles.bottomLine}>
          {isPhoto ? (
            <View style={styles.photoPreview}>
              <Feather name="image" size={13} color={unread ? COLORS.text : COLORS.textSecondary} />
              <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
                {t('chat.photo' as TranslationKey)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.preview, unread && styles.previewUnread]} numberOfLines={1}>
              {c.lastMessage ?? t('chat.noMessages' as TranslationKey)}
            </Text>
          )}
          {unread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{c.unreadCount}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.md,
    paddingVertical: SPACING.md - 2, paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  col: { flex: 1, gap: 3 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  time: { fontSize: 11, fontWeight: '500', color: COLORS.textLight },
  timeUnread: { color: COLORS.primary, fontWeight: '700' },
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  photoPreview: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  preview: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  previewUnread: { color: COLORS.text, fontWeight: '600' },
  badge: {
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
  },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: '800' },
});
