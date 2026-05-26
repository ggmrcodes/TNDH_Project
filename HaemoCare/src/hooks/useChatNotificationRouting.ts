/**
 * useChatNotificationRouting — clinician-side chat push routing (Phase 4).
 *
 * Listens for notification-response events and, when the tapped notification
 * carries { type: 'chat' }, navigates the clinician to ClinicianInbox.
 *
 * v1 routes to the inbox surface rather than directly to the thread because
 * the push payload only contains linkId — resolving otherPartyName + link
 * status requires a DB fetch that is better done inside ClinicianInbox.
 * Direct-to-thread routing is a future refinement.
 *
 * Call this hook inside ClinicianStackNavigator so the navigation ref is
 * available. It is a no-op when the user is not a clinician.
 */

import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import type { ClinicianStackParamList } from '../types/navigation';

export function useChatNotificationRouting(): void {
  const { user, role } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<ClinicianStackParamList>>();

  useEffect(() => {
    if (!user || role !== 'clinician') return;

    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { type?: string; linkId?: string }
          | undefined;

        if (data?.type !== 'chat') return;

        // Route to ClinicianInbox; the inbox will highlight the relevant thread.
        try {
          navigation.navigate('ClinicianInbox');
        } catch (err) {
          console.warn('useChatNotificationRouting: navigate failed', err);
        }
      }
    );

    return () => {
      sub.remove();
    };
  }, [user, role, navigation]);
}
