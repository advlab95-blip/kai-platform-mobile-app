import * as Notifications from 'expo-notifications';

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/**
 * Schedule local notifications 10 minutes before each class.
 * Cancels all previous reminders and reschedules from timetable.
 * Call this after loading timetable data.
 */
export async function scheduleClassReminders(timetable: Array<{
  subject: string;
  day_of_week: number; // 0=Sunday, 4=Thursday
  start_time: string;  // "HH:MM" or "HH:MM:SS"
  room?: string;
  status?: string;
  users?: { full_name?: string };
}>) {
  // Cancel all existing class reminders
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of existing) {
    if (notif.content.data?.type === 'class_reminder') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }

  // Schedule new reminders for each active class
  for (const slot of timetable) {
    if (slot.status === 'cancelled') continue;

    const [hours, minutes] = (slot.start_time || '08:00').split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes)) continue;

    // Calculate 10 minutes before
    let reminderHour = hours;
    let reminderMin = minutes - 10;
    if (reminderMin < 0) {
      reminderMin += 60;
      reminderHour -= 1;
    }
    if (reminderHour < 0) continue;

    // Map day_of_week (0=Sun) to Expo weekday (1=Sun, 2=Mon, ..., 7=Sat)
    const expoWeekday = slot.day_of_week + 1;
    if (expoWeekday > 5) continue; // Skip Friday/Saturday

    const teacherName = (slot.users as any)?.full_name || '';
    const roomText = slot.room ? ` — ${slot.room}` : '';

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `${slot.subject} بعد 10 دقائق`,
          body: `${teacherName}${roomText}`,
          sound: 'default',
          data: { type: 'class_reminder', subject: slot.subject },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday: expoWeekday,
          hour: reminderHour,
          minute: reminderMin,
        },
      });
    } catch (err) {
      console.error('[Class reminder schedule error]:', err);
    }
  }
}

/**
 * Cancel all class reminders
 */
export async function cancelAllClassReminders() {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of existing) {
    if (notif.content.data?.type === 'class_reminder') {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}
