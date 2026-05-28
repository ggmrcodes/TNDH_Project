import React from 'react';
import { View, Image, TouchableOpacity, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { COLORS, SPACING } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { TranslationKey } from '../../i18n';

interface Props {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

/**
 * Distraction-free image viewer reused by the chat photo viewer pattern.
 * Tap the body or the close chip to dismiss.
 *
 * Backdrop / chip alphas are deliberately literal — they're overlay
 * opacities where a solid theme token doesn't apply (mirrors the chat
 * thread's photo viewer styling, kept in sync intentionally).
 */
export default function FullScreenImageViewer({ visible, uri, onClose }: Props) {
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  if (!uri) return null;
  return (
    <Modal visible={visible} transparent statusBarTranslucent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={[styles.close, { top: insets.top + SPACING.sm }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close' as TranslationKey)}
        >
          <Feather name="x" size={26} color={COLORS.white} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.body} activeOpacity={1} onPress={onClose}>
          <Image source={{ uri }} style={{ width: win.width, height: win.height }} resizeMode="contain" />
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(27, 35, 51, 0.96)' },
  body: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  close: {
    position: 'absolute',
    right: SPACING.md,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
});
