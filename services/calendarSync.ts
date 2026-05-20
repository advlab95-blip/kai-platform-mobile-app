import * as Calendar from 'expo-calendar';
import { Platform, Alert } from 'react-native';

const DAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس'];
const CALENDAR_NAME = 'منصة كاي — الجدول الدراسي';

/**
 * Get or create KAI calendar on device
 */
async function getOrCreateCalendar(): Promise<string> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new Error('يرجى السماح بالوصول للتقويم');

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const existing = calendars.find(c => c.title === CALENDAR_NAME);
  if (existing) return existing.id;

  // Create new calendar
  const defaultCalendar = calendars.find(c => c.allowsModifications);
  const newCalId = await Calendar.createCalendarAsync({
    title: CALENDAR_NAME,
    color: '#1D4ED8',
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: defaultCalendar?.source?.id,
    source: {
      isLocalAccount: true,
      name: CALENDAR_NAME,
      type: Platform.OS === 'ios' ? Calendar.CalendarType.LOCAL : 'local' as any,
    },
    name: CALENDAR_NAME,
    ownerAccount: 'kai-platform',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  return newCalId;
}

/**
 * Get next occurrence date for a given day_of_week
 */
function getNextDate(dayOfWeek: number, hours: number, minutes: number): Date {
  const now = new Date();
  const currentDay = now.getDay();
  let daysUntil = dayOfWeek - currentDay;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0 && (hours < now.getHours() || (hours === now.getHours() && minutes < now.getMinutes()))) {
    daysUntil = 7;
  }
  const date = new Date(now);
  date.setDate(date.getDate() + daysUntil);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

/**
 * Sync timetable to device calendar
 */
export async function syncToCalendar(timetable: Array<{
  subject: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room?: string;
  status?: string;
  users?: { full_name?: string };
}>) {
  try {
    const calId = await getOrCreateCalendar();

    // Delete old KAI events
    const now = new Date();
    const twoWeeksLater = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const existingEvents = await Calendar.getEventsAsync([calId], now, twoWeeksLater);
    for (const ev of existingEvents) {
      await Calendar.deleteEventAsync(ev.id);
    }

    // Create new events for next 2 weeks
    let count = 0;
    for (const slot of timetable) {
      if (slot.status === 'cancelled') continue;

      const [startH, startM] = (slot.start_time || '08:00').split(':').map(Number);
      const [endH, endM] = (slot.end_time || '09:00').split(':').map(Number);
      if (isNaN(startH) || isNaN(startM)) continue;

      // Create for this week and next week
      for (let weekOffset = 0; weekOffset < 2; weekOffset++) {
        const startDate = getNextDate(slot.day_of_week, startH, startM);
        startDate.setDate(startDate.getDate() + weekOffset * 7);
        const endDate = new Date(startDate);
        endDate.setHours(endH || startH + 1, endM || 0, 0, 0);

        const teacher = (slot.users as any)?.full_name || '';
        const location = slot.room || '';

        await Calendar.createEventAsync(calId, {
          title: slot.subject,
          notes: teacher ? `الأستاذ: ${teacher}` : undefined,
          location,
          startDate,
          endDate,
          timeZone: 'Asia/Baghdad',
          alarms: [{ relativeOffset: -10 }], // 10 min before
        });
        count++;
      }
    }

    Alert.alert('تم', `تمت مزامنة ${count} حصة مع التقويم`);
  } catch (err: any) {
    Alert.alert('خطأ', err.message || 'فشل المزامنة مع التقويم');
  }
}
