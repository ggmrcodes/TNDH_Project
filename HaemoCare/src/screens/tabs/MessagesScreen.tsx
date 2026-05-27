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
  title: { ...TYPOGRAPHY.h1, color: COLORS.text, paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  // Inset past the 48px avatar (md padding + md gap) for a clean iOS-style divider.
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.borderLight, marginLeft: SPACING.md * 2 + 48 },
  emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingTop: SPACING.xxl, gap: SPACING.md },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 14 },
});
