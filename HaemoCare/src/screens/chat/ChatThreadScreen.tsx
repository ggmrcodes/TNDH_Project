import React, { useLayoutEffect } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import ChatThread from '../../components/chat/ChatThread';
import { COLORS } from '../../config/theme';
import type { LinkStatus } from '../../types/database';

type ChatThreadParams = { ChatThread: { linkId: string; otherPartyName: string; status: LinkStatus } };

export default function ChatThreadScreen() {
  const route = useRoute<RouteProp<ChatThreadParams, 'ChatThread'>>();
  const navigation = useNavigation();
  const { linkId, otherPartyName, status } = route.params;

  useLayoutEffect(() => {
    navigation.setOptions({ title: otherPartyName, headerShown: true });
  }, [navigation, otherPartyName]);

  return (
    <SafeAreaView style={styles.safe}>
      <ChatThread linkId={linkId} status={status} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: COLORS.background } });
