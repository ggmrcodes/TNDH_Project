import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, SafeAreaView, RefreshControl } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConversations } from '../../hooks/useConversations';
import ConversationRow from '../../components/chat/ConversationRow';
import { TranslationKey } from '../../i18n';

export default function ClinicianInboxScreen() {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const { conversations, loading, refresh } = useConversations();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    refresh();
    // Spinner stays for ~700ms — the hook's refetch is async but its
    // refresh() is fire-and-forget (just bumps tick). 700ms gives the
    // user enough feedback that something happened without locking the UI.
    await new Promise((r) => setTimeout(r, 700));
    setRefreshing(false);
  }, [refresh]);
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{t('chat.title' as TranslationKey)}</Text>
      <Text style={styles.subtitle}>{t('chat.subtitleClinician' as TranslationKey)}</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.linkId}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />
        }
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => navigation.navigate('ChatThread', { linkId: item.linkId, otherPartyName: item.otherPartyName, otherPartySubtitle: item.otherPartySubtitle, status: item.status })}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
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
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.borderLight, marginLeft: SPACING.md * 2 + 48 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxl, gap: SPACING.md },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14 },
});
