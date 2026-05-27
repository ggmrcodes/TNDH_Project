import React from 'react';
import Avatar from 'react-native-boring-avatars';
import { COLORS } from '../../config/theme';

// On-brand palette for the generated "beam" avatars — teal family plus the warm
// gold/coral accents. boring-avatars picks deterministically from this set per
// name, so every person gets a distinct but on-theme avatar (no ad-hoc colors).
const AVATAR_COLORS = [
  COLORS.primary,
  COLORS.primaryGradientEnd,
  COLORS.primaryDark,
  COLORS.gold,
  COLORS.accent,
];

// Shared chat avatar used by both the thread header and the conversation list.
// `name` is the seed (a display name or an HC-XXXXXX id both work).
export default function ChatAvatar({ name, size = 44 }: { name: string; size?: number }) {
  return <Avatar size={size} name={name || 'HaemoCare'} variant="beam" colors={AVATAR_COLORS} />;
}
