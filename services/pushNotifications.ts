import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Configure notification behavior. On web, setNotificationHandler internally
// touches the browser Notification API at module load which prints a console
// warning ("permission may only be requested from a user gesture") even though
// no permission is being requested yet. Native only.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Register for push notifications and save token to Supabase.
 */
export async function registerForPushNotifications(
  userId: string,
  role: string,
  instituteId?: string
): Promise<string | null> {
  // Web: browsers reject Notification.requestPermission() unless invoked inside
  // a short-running user-gesture handler. Calling it on app mount triggers a
  // console error and the request silently fails anyway. Skip entirely.
  if (Platform.OS === 'web') return null;

  // Push only works on physical devices
  if (!Device.isDevice) {
    if (__DEV__) console.log('Push notifications require a physical device');
    return null;
  }

  // Check/request permission
  const permResult = await Notifications.getPermissionsAsync() as any;
  let finalStatus = permResult.status;

  if (finalStatus !== 'granted') {
    const reqResult = await Notifications.requestPermissionsAsync() as any;
    finalStatus = reqResult.status;
  }

  if (finalStatus !== 'granted') {
    if (__DEV__) console.log('Push notification permission denied');
    return null;
  }

  // Android notification channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'منصة كاي',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#2F2FBA',
      sound: 'default',
    });
  }

  // Get Expo push token
  try {
    const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
    // Skip if no valid project ID (development/Expo Go)
    if (!projectId || projectId === 'YOUR_PROJECT_ID' || projectId.length < 10) {
      if (__DEV__) console.log('Push notifications: skipped (no project ID configured)');
      return null;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    // Save to Supabase (with institute_id for multi-tenant scoping)
    await savePushToken(userId, token, role, instituteId);

    return token;
  } catch (error) {
    // Silent fail in development — push tokens only work in production builds
    return null;
  }
}

/**
 * Save push token to Supabase push_tokens table.
 *
 * Runs during app startup — wrapped in withRetry because a failed save here
 * means the user silently stops receiving push until the next login. Ride out
 * a flaky connection rather than drop it on the floor.
 */
async function savePushToken(userId: string, token: string, role: string, instituteId?: string) {
  const record: any = {
    user_id: userId,
    token,
    role,
    created_at: new Date().toISOString(),
  };
  if (instituteId) record.institute_id = instituteId;
  try {
    const { withRetry } = await import('./api');
    await withRetry(async () => {
      const { error } = await supabase.from('push_tokens').upsert(record, { onConflict: 'token' });
      if (error) throw error;
    });
  } catch (error) {
    console.error('Failed to save push token:', error);
  }
}

/**
 * Remove push token on logout.
 */
export async function removePushToken(userId: string) {
  await supabase.from('push_tokens').delete().eq('user_id', userId);
}

/**
 * Set badge count on app icon.
 */
export async function setBadgeCount(count: number) {
  await Notifications.setBadgeCountAsync(count);
}

// Removed: getTokensForTarget. The `push_tokens` table must not be read from
// the client — token lookup is server-only inside the `send-push` Edge
// Function. All delivery paths go through `callSendPush`, which enforces the
// institute gate and opt-outs.

/**
 * Notification event triggers — all paths funnel through the `send-push` Edge
 * Function so the institute gate, opt-out checks, and notifications-table
 * logging happen in one trusted place. Never write a trigger that reads
 * `push_tokens` from the client or calls the Expo API directly.
 */
export const NotificationTriggers = {
  /**
   * Student absent → notify parent
   */
  async studentAbsent(studentId: string, studentName: string, subject: string, instituteId?: string) {
    const { data: parentLink } = await supabase
      .from('parent_child')
      .select('parent_id')
      .eq('student_id', studentId)
      .limit(1)
      .single();
    if (!parentLink?.parent_id) return;

    await callSendPush({
      user_ids: [parentLink.parent_id],
      title: 'تنبيه غياب',
      body: `${studentName} غائب عن حصة ${subject}`,
      type: 'attendance',
      category: 'academic',
      institute_id: instituteId,
      data: { type: 'absence', studentId },
    });
  },

  /**
   * New announcement → notify target role
   */
  async newAnnouncement(title: string, content: string, targetRole: string, instituteId: string) {
    // Resolve recipient ids for the role within the institute via the profiles table.
    const { data: recipients } = await supabase
      .from('users')
      .select('id')
      .eq('role', targetRole)
      .eq('institute_id', instituteId)
      .limit(1000);
    const ids = (recipients || []).map((r: any) => r.id).filter(Boolean);
    if (!ids.length) return;

    await callSendPush({
      user_ids: ids,
      title,
      body: content,
      type: 'announcement',
      category: 'admin',
      institute_id: instituteId,
      data: { type: 'announcement', targetRole },
    });
  },

  /**
   * New message → notify recipient
   */
  async newMessage(recipientId: string, senderName: string, preview: string, instituteId?: string) {
    await callSendPush({
      user_ids: [recipientId],
      title: `رسالة من ${senderName}`,
      body: preview.substring(0, 100),
      type: 'message',
      category: 'social',
      institute_id: instituteId,
      data: { type: 'message', senderId: recipientId },
    });
  },

  /**
   * Upcoming exam → notify students in a specific class
   */
  async upcomingExam(examTitle: string, classId: string, dateStr: string, instituteId: string) {
    const { data: enrollments } = await supabase
      .from('enrollments')
      .select('user_id')
      .eq('class_id', classId)
      .eq('institute_id', instituteId)
      .eq('status', 'active')
      .limit(1000);
    const ids = (enrollments || []).map((r: any) => r.user_id).filter(Boolean);
    if (!ids.length) return;

    await callSendPush({
      user_ids: ids,
      title: 'امتحان قادم',
      body: `${examTitle} — ${dateStr}`,
      type: 'exam',
      category: 'academic',
      institute_id: instituteId,
      data: { type: 'exam', classId },
    });
  },

  /**
   * Medical visit → notify parent
   */
  async medicalVisit(studentId: string, studentName: string, notes: string, instituteId?: string) {
    const { data: parentLink } = await supabase
      .from('parent_child')
      .select('parent_id')
      .eq('student_id', studentId)
      .limit(1)
      .single();
    if (!parentLink?.parent_id) return;

    await callSendPush({
      user_ids: [parentLink.parent_id],
      title: `زيارة العيادة: ${studentName}`,
      body: notes,
      type: 'medical',
      category: 'urgent',
      institute_id: instituteId,
      data: { type: 'medical', studentId },
    });
  },
};

/**
 * Phase 4.3 client wrapper — invoke the `send-push` Edge Function.
 * Prefer this over `sendExpoPush` from UI code: it (a) checks institute
 * opt-outs, (b) writes to `notifications` table, (c) never exposes the
 * push-tokens table to the client.
 */
export interface SendPushInput {
  user_ids: string[];
  title: string;
  body: string;
  type: string;
  category?: 'academic' | 'financial' | 'admin' | 'urgent' | 'social';
  institute_id?: string;
  data?: Record<string, any>;
}

export async function callSendPush(input: SendPushInput): Promise<{ sent: number; failed: number } | null> {
  if (!input.user_ids?.length) return { sent: 0, failed: 0 };
  try {
    const { data, error } = await supabase.functions.invoke('send-push', { body: input });
    if (error) {
      console.error('send-push invoke failed:', error.message);
      return null;
    }
    return data as { sent: number; failed: number };
  } catch (e) {
    console.error('send-push unexpected error:', e);
    return null;
  }
}

/**
 * Phase 4.6 — fetch institute-level notification toggles. Used by the
 * settings screen and by client code deciding whether to skip a push.
 */
export async function getInstituteNotifSettings(instituteId: string) {
  const { data } = await supabase
    .from('institution_notification_settings')
    .select('*')
    .eq('institute_id', instituteId)
    .maybeSingle();
  return data;
}

export async function updateInstituteNotifSettings(
  instituteId: string,
  patch: Partial<{
    notify_attendance: boolean;
    notify_grades: boolean;
    notify_assignments: boolean;
    notify_fees: boolean;
    notify_admin_ads: boolean;
    notify_messages: boolean;
  }>
) {
  const { error } = await supabase
    .from('institution_notification_settings')
    .upsert(
      { institute_id: instituteId, ...patch, updated_at: new Date().toISOString() },
      { onConflict: 'institute_id' },
    );
  if (error) throw new Error(error.message);
}

/**
 * Listener types for handling notification interactions.
 */
export type NotificationListener = Notifications.Subscription;

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
): NotificationListener {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
): NotificationListener {
  return Notifications.addNotificationResponseReceivedListener(callback);
}
