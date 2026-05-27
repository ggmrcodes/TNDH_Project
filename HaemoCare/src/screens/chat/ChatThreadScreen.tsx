import React, { useLayoutEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ChatThread from '../../components/chat/ChatThread';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import type { LinkStatus } from '../../types/database';

type ChatThreadParams = {
  ChatThread: {
    linkId: string;
    otherPartyName: string;
    otherPartySubtitle?: string | null;
    status: LinkStatus;
  };
};

// Up to two initials from a display name, skipping common honorifics (TH + EN).
// Returns null for non-name labels like "HC-972634" so we fall back to an icon.
function deriveInitials(name: string): string | null {
  const trimmed = (name ?? '').trim();
  if (!trimmed || /^HC-/i.test(trimmed)) return null;
  const cleaned = trimmed.replace(/^(dr\.?|prof\.?|mr\.?|mrs\.?|ms\.?|นพ\.?|พญ\.?|คุณ)\s*/i, '').trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const letters = words.slice(0, 2).map((w) => w[0]).join('');
  return /[A-Za-z฀-๿]/.test(letters) ? letters.toUpperCase() : null;
}

export default function ChatThreadScreen() {
  const route = useRoute<RouteProp<ChatThreadParams, 'ChatThread'>>();
  const navigation = useNavigation<NativeStackNavigationProp<ChatThreadParams>>();
  const { linkId, otherPartyName, otherPartySubtitle, status } = route.params;

  // Messaging-style header: avatar (initials, icon fallback) + name + optional
  // context line (hospital / patient id), centered and flat. Scoped to this
  // screen via setOptions so other stack screens keep the default header.
  useLayoutEffect(() => {
    const initials = deriveInitials(otherPartyName);
    navigation.setOptions({
      headerShown: true,
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerTitle: () => (
        <View style={styles.titleRow}>
          <View style={styles.avatar}>
            {initials ? (
              <Text style={styles.avatarText} allowFontScaling={false}>{initials}</Text>
            ) : (
              <Feather name="user" size={16} color={COLORS.textOnPrimary} />
            )}
          </View>
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
  avatar: {
    width: 36, height: 36, borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: COLORS.textOnPrimary, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  titleTextCol: { flexShrink: 1 },
  title: { fontSize: 16, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  subtitle: { fontSize: 12, fontWeight: '500', color: COLORS.textSecondary, lineHeight: 15 },
});
