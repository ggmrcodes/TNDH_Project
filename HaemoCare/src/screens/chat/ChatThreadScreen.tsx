import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChatThread from '../../components/chat/ChatThread';
import ChatAvatar from '../../components/chat/ChatAvatar';
import { COLORS, SPACING } from '../../config/theme';
import type { LinkStatus } from '../../types/database';

type ChatThreadParams = {
  ChatThread: {
    linkId: string;
    otherPartyName: string;
    otherPartySubtitle?: string | null;
    status: LinkStatus;
  };
};

export default function ChatThreadScreen() {
  const route = useRoute<RouteProp<ChatThreadParams, 'ChatThread'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatThreadParams>>();
  const { linkId, otherPartyName, otherPartySubtitle, status } = route.params;

  // Messaging-style header: shared avatar + name + optional context line
  // (hospital / patient id), centered and flat. Scoped to this screen via
  // setOptions so other stack screens keep the default header.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerTitle: () => (
        <View style={styles.titleRow}>
          <ChatAvatar name={otherPartyName} size={36} />
          <View style={styles.titleTextCol}>
            <Text style={styles.title} numberOfLines={1}>{otherPartyName}</Text>
            {otherPartySubtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>{otherPartySubtitle}</Text>
            ) : null}
          </View>
        </View>
      ),
    });
  }, [navigation, otherPartyName, otherPartySubtitle]);

  return (
    <View style={styles.screen}>
      <ChatThread linkId={linkId} status={status} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, maxWidth: 260 },
  titleTextCol: { flexShrink: 1 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  subtitle: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary, lineHeight: 15 },
});
