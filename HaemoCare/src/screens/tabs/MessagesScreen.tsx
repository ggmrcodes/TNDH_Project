import React from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConversations } from '../../hooks/useConversations';
import ConversationRow from '../../components/chat/ConversationRow';
import { TranslationKey } from '../../i18n';

export default function MessagesScreen() {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const { conversations, loading } = useConversations();

  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{t('chat.title' as TranslationKey)}</Text>
      <Text style={styles.subtitle}>{t('chat.subtitlePatient' as TranslationKey)}</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.linkId}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => navigation.navigate('ChatThread', { linkId: item.linkId, otherPartyName: item.otherPartyName, otherPartySubtitle: item.otherPartySubtitle, status: item.status })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={conversations.length > 0 ? (
          <View style={styles.footerNote}>
            <Feather name="lock" size={12} color={COLORS.textLight} />
            <Text style={styles.footerText}>{t('chat.privacyNote' as TranslationKey)}</Text>
          </View>
        ) : null}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyWrap}>
            <Feather name="message-circle" size={40} color={COLORS.textLight} />
            <Text style={styles.empty}>{t('chat.empty' as TranslationKey)}</Text>
          </View>
        ) : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: 2 },
  subtitle: { fontSize: 14, color: COLORS.textSecondary, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md },
  // Inset past the 48px avatar (md padding + md gap) for a clean iOS-style divider.
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.borderLight, marginLeft: SPACING.md * 2 + 48 },
  footerNote: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  footerText: { flex: 1, fontSize: 12, lineHeight: 17, color: COLORS.textLight },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxl, gap: SPACING.md },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14 },
});
