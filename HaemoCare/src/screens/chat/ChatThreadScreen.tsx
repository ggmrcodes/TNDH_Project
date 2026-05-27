import React, { useLayoutEffect } from 'react';
import { SafeAreaView, View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChatThread from '../../components/chat/ChatThread';
import { COLORS, SPACING } from '../../config/theme';
import type { LinkStatus } from '../../types/database';

type ChatThreadParams = { ChatThread: { linkId: string; otherPartyName: string; status: LinkStatus } };

export default function ChatThreadScreen() {
  const route = useRoute<RouteProp<ChatThreadParams, 'ChatThread'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatThreadParams>>();
  const { linkId, otherPartyName, status } = route.params;

  // Messaging-style header: small avatar + name, centered, flat (no shadow
  // hairline). Scoped to this screen via setOptions so other stack screens
  // keep the default header.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerTitle: () => (
        <View style={styles.titleRow}>
          <View style={styles.avatar}>
            <Feather name="user" size={15} color={COLORS.white} />
          </View>
          <Text style={styles.title} numberOfLines={1}>{otherPartyName}</Text>
        </View>
      ),
    });
  }, [navigation, otherPartyName]);

  return (
    <SafeAreaView style={styles.safe}>
      <ChatThread linkId={linkId} status={status} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, maxWidth: 220 },
  avatar: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.primary,
    justifyContent: 'center', alignItems: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, flexShrink: 1 },
});
