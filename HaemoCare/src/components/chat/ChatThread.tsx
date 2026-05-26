import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useThread } from '../../hooks/useThread';
import { TranslationKey } from '../../i18n';
import type { LinkStatus } from '../../types/database';

interface Props {
  linkId: string;
  status: LinkStatus;
}

export default function ChatThread({ linkId, status }: Props) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { messages, loading, sending, send } = useThread(linkId);
  const [draft, setDraft] = useState('');
  const isActive = status === 'active';

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await send(body);
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  {item.body ? (
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  ) : null}
                  <Text style={[styles.time, mine && styles.timeMine]}>{fmtTime(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{t('chat.threadEmpty' as TranslationKey)}</Text>}
        />
      )}

      {isActive ? (
        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.composerPlaceholder' as TranslationKey)}
            placeholderTextColor={COLORS.textLight}
            multiline
            editable={!sending}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send' as TranslationKey)}
          >
            {sending ? <ActivityIndicator size="small" color={COLORS.white} /> : <Feather name="send" size={18} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.closedBanner}>
          <Feather name="lock" size={14} color={COLORS.textSecondary} />
          <Text style={styles.closedText}>{t('chat.closed' as TranslationKey)}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.md, gap: SPACING.xs },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomRightRadius: RADIUS.sm },
  bubbleOther: { backgroundColor: COLORS.white, borderBottomLeftRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.borderLight },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  bubbleTextMine: { color: COLORS.white },
  time: { fontSize: 10, color: COLORS.textLight, marginTop: 4, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, padding: SPACING.xl },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm,
    padding: SPACING.sm, borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  input: {
    flex: 1, maxHeight: 120, minHeight: 40, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  closedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.background,
  },
  closedText: { fontSize: 13, color: COLORS.textSecondary },
});
