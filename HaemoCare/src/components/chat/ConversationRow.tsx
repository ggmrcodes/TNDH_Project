import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';
import type { Conversation } from '../../types/database';

interface Props { conversation: Conversation; onPress: () => void; }

export default function ConversationRow({ conversation: c, onPress }: Props) {
  const { t, language } = useLanguage();
  const time = c.lastMessageAt
    ? new Date(c.lastMessageAt).toLocaleDateString(language === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' })
    : '';
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.row}>
      <View style={styles.avatar}><Feather name="user" size={18} color={COLORS.primary} /></View>
      <View style={styles.col}>
        <View style={styles.topLine}>
          <Text style={styles.name} numberOfLines={1}>{c.otherPartyName}</Text>
          {time ? <Text style={styles.time}>{time}</Text> : null}
        </View>
        <View style={styles.bottomLine}>
          <Text style={styles.preview} numberOfLines={1}>
            {c.lastMessage ?? t('chat.noMessages' as TranslationKey)}
          </Text>
          {c.unreadCount > 0 && (
            <View style={styles.badge}><Text style={styles.badgeText}>{c.unreadCount}</Text></View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primaryLight, justifyContent: 'center', alignItems: 'center' },
  col: { flex: 1, gap: 2 },
  topLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  time: { fontSize: 11, color: COLORS.textLight },
  bottomLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACING.sm },
  preview: { flex: 1, fontSize: 13, color: COLORS.textSecondary },
  badge: { minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: '800' },
});
