import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { COLORS, RADIUS } from '../../config/theme';
import { deriveInitials } from '../../utils/initials';

// Shared chat avatar: a solid-teal circle with the other party's initials,
// falling back to a user icon for id-style names (HC-XXXXXX). Used by both the
// thread header and the conversation list so the treatment is consistent.
export default function ChatAvatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = deriveInitials(name);
  return (
    <View style={[styles.avatar, { width: size, height: size }]}>
      {initials ? (
        <Text style={[styles.text, { fontSize: Math.round(size * 0.38) }]} allowFontScaling={false}>
          {initials}
        </Text>
      ) : (
        <Feather name="user" size={Math.round(size * 0.44)} color={COLORS.textOnPrimary} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { color: COLORS.textOnPrimary, fontWeight: '700', letterSpacing: 0.3 },
});
