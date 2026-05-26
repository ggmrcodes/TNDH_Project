import React from 'react';
import { Text, FlatList, StyleSheet, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS, SPACING, TYPOGRAPHY } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useConversations } from '../../hooks/useConversations';
import ConversationRow from '../../components/chat/ConversationRow';
import { TranslationKey } from '../../i18n';

export default function ClinicianInboxScreen() {
  const { t } = useLanguage();
  const navigation = useNavigation<any>();
  const { conversations, loading } = useConversations();
  return (
    <SafeAreaView style={styles.safe}>
      <Text style={styles.title}>{t('chat.title' as TranslationKey)}</Text>
      <FlatList
        data={conversations}
        keyExtractor={(c) => c.linkId}
        renderItem={({ item }) => (
          <ConversationRow
            conversation={item}
            onPress={() => navigation.navigate('ChatThread', { linkId: item.linkId, otherPartyName: item.otherPartyName, status: item.status })}
          />
        )}
        ListEmptyComponent={!loading ? <Text style={styles.empty}>{t('chat.empty' as TranslationKey)}</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.white },
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14, marginTop: SPACING.xl },
});
