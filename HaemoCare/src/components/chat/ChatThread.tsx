import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image, Alert, Keyboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { COLORS, SPACING, RADIUS } from '../../config/theme';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { useThread } from '../../hooks/useThread';
import { TranslationKey } from '../../i18n';
import type { LinkStatus } from '../../types/database';
import * as realService from '../../services/chatService';
import * as mockService from '../../mock/services';

interface Props {
  linkId: string;
  status: LinkStatus;
}

// ── ChatImage sub-component ────────────────────────────────────
// Resolves a signed URL on mount and renders the image with a loading placeholder.
interface ChatImageProps {
  path: string;
  isMockMode: boolean;
}

function ChatImage({ path, isMockMode }: ChatImageProps) {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const svc = isMockMode ? mockService : realService;
      const url = await svc.getChatImageSignedUrl(path);
      if (!cancelled) setUri(url);
    })();
    return () => { cancelled = true; };
  }, [path, isMockMode]);

  if (!uri) {
    return (
      <View style={imgStyles.placeholder}>
        <ActivityIndicator size="small" color={COLORS.primary} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={imgStyles.image}
      resizeMode="cover"
    />
  );
}

const imgStyles = StyleSheet.create({
  image: { width: 200, height: 200, borderRadius: RADIUS.md, marginBottom: SPACING.xs },
  placeholder: {
    width: 200, height: 200, borderRadius: RADIUS.md,
    backgroundColor: COLORS.borderLight, justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.xs,
  },
});

// ── ChatThread ─────────────────────────────────────────────────

export default function ChatThread({ linkId, status }: Props) {
  const { t, language } = useLanguage();
  const { user, isMockMode } = useAuth();
  const { messages, loading, sending, send } = useThread(linkId);
  const [draft, setDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const isActive = status === 'active';
  const composerDisabled = sending || uploading;
  const insets = useSafeAreaInsets();

  // Track keyboard so the footer hugs the keyboard when open, but clears the
  // home indicator (insets.bottom) when closed — avoids a dead gap above the
  // keyboard while still respecting the safe area at rest.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const footerPadBottom = keyboardVisible ? SPACING.sm : Math.max(insets.bottom, SPACING.sm);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    await send(body);
  };

  const handleAttach = async () => {
    if (Platform.OS !== 'web') {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(t('chat.uploadError' as TranslationKey));
        return;
      }
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (result.canceled || !result.assets || result.assets.length === 0) return;
    const asset = result.assets[0];

    const svc = isMockMode ? mockService : realService;
    let uploadedPath: string | null = null;
    setUploading(true);
    try {
      // Resize to max 1200px wide, compress to 0.8 JPEG.
      const needsResize = (asset.width ?? 0) > 1200;
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        needsResize ? [{ resize: { width: 1200 } }] : [],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
      );

      const response = await fetch(manipulated.uri);
      const blob = await response.blob();

      uploadedPath = await svc.uploadChatImage(linkId, blob);
      await send('', { path: uploadedPath, type: 'image' });
    } catch (err) {
      if (uploadedPath) { await svc.deleteChatImage(uploadedPath).catch(() => {}); }
      Alert.alert(t('chat.uploadError' as TranslationKey));
    } finally {
      setUploading(false);
    }
  };

  const fmtTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: SPACING.xl }} />
      ) : (
        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const mine = item.sender_id === user?.id;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowOther]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  {item.attachment_path && item.attachment_type === 'image' ? (
                    <ChatImage path={item.attachment_path} isMockMode={isMockMode} />
                  ) : null}
                  {item.body ? (
                    <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                  ) : null}
                  <Text style={[styles.time, mine && styles.timeMine]}>{fmtTime(item.created_at)}</Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={styles.empty}>{t('chat.threadEmpty' as TranslationKey)}</Text>}
        />
      )}

      {isActive ? (
        <View style={[styles.composer, { paddingBottom: footerPadBottom }]}>
          <TouchableOpacity
            onPress={handleAttach}
            disabled={composerDisabled}
            style={[styles.attachBtn, composerDisabled && styles.attachBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.attachImage' as TranslationKey)}
          >
            {uploading
              ? <ActivityIndicator size="small" color={COLORS.primary} />
              : <Feather name="image" size={22} color={composerDisabled ? COLORS.textLight : COLORS.primary} />
            }
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('chat.composerPlaceholder' as TranslationKey)}
            placeholderTextColor={COLORS.textLight}
            multiline
            editable={!composerDisabled}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!draft.trim() || composerDisabled}
            style={[styles.sendBtn, (!draft.trim() || composerDisabled) && styles.sendBtnDisabled]}
            accessibilityRole="button"
            accessibilityLabel={t('chat.send' as TranslationKey)}
          >
            {sending ? <ActivityIndicator size="small" color={COLORS.white} /> : <Feather name="send" size={18} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.closedBanner, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
          <Feather name="lock" size={14} color={COLORS.textSecondary} />
          <Text style={styles.closedText}>{t('chat.closed' as TranslationKey)}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.md, gap: SPACING.xs },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  rowMine: { justifyContent: 'flex-end' },
  rowOther: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.lg },
  bubbleMine: { backgroundColor: COLORS.primary, borderBottomRightRadius: RADIUS.sm },
  bubbleOther: { backgroundColor: COLORS.white, borderBottomLeftRadius: RADIUS.sm, borderWidth: 1, borderColor: COLORS.borderLight },
  bubbleText: { fontSize: 15, color: COLORS.text, lineHeight: 20 },
  bubbleTextMine: { color: COLORS.white },
  time: { fontSize: 10, color: COLORS.textLight, marginTop: 4, alignSelf: 'flex-end' },
  timeMine: { color: 'rgba(255,255,255,0.7)' },
  empty: { textAlign: 'center', color: COLORS.textSecondary, fontSize: 13, padding: SPACING.xl },
  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  attachBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  attachBtnDisabled: { opacity: 0.4 },
  input: {
    flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: RADIUS.lg, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendBtnDisabled: { opacity: 0.5 },
  closedBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight, backgroundColor: COLORS.background,
  },
  closedText: { fontSize: 13, color: COLORS.textSecondary },
});
