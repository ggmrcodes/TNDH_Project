import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
}

/**
 * Cross-platform confirmation prompt. On native this uses Alert.alert with a
 * Cancel + destructive/default button. On web it falls back to window.confirm
 * because react-native-web's Alert.alert is literally `static alert() {}` —
 * a no-op (see node_modules/react-native-web/src/exports/Alert/index.js).
 *
 * Resolves true if the user confirms, false otherwise.
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') {
        resolve(false);
        return;
      }
      resolve(window.confirm(`${opts.title}\n\n${opts.body}`));
      return;
    }
    Alert.alert(opts.title, opts.body, [
      { text: opts.cancelLabel, style: 'cancel', onPress: () => resolve(false) },
      {
        text: opts.confirmLabel,
        style: opts.destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}
