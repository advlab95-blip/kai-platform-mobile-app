import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';

/**
 * Local notification preferences — stored in AsyncStorage so the user can mute
 * specific notification categories without touching the backend. Consumed by
 * useNotificationStore (see `shouldDeliverNotification` helper below).
 *
 * Each user has their own key: `notif-prefs:<userId>`. When a category is muted
 * the notification still saves to DB (so admins/teachers see "delivered") but
 * the client filters it out of the bell dropdown + skips the push banner.
 */

interface NotifPrefs {
  mutedTypes: string[];
}

const DEFAULT_PREFS: NotifPrefs = { mutedTypes: [] };
const PREFS_KEY = (userId: string) => `notif-prefs:${userId}`;

// Categories the user can toggle. Grouped with an icon + color so the settings
// screen stays readable at a glance.
const CATEGORIES = [
  { key: 'exam', label: 'الامتحانات', icon: 'document-text', color: '#3B82F6' },
  { key: 'grade', label: 'الدرجات', icon: 'trophy', color: '#F59E0B' },
  { key: 'homework', label: 'الواجبات', icon: 'book', color: '#7C3AED' },
  { key: 'ai_lesson', label: 'دروس AI', icon: 'sparkles', color: '#EC4899' },
  { key: 'announcement', label: 'الإعلانات', icon: 'megaphone', color: '#10B981' },
  { key: 'message', label: 'الرسائل', icon: 'chatbubbles', color: '#0EA5E9' },
  { key: 'medical', label: 'التنبيهات الطبية', icon: 'medkit', color: '#EF4444' },
  { key: 'attendance', label: 'الحضور', icon: 'calendar', color: '#6366F1' },
  { key: 'voice', label: 'الرسائل الصوتية', icon: 'mic', color: '#8B5CF6' },
  { key: 'gallery', label: 'ألبومات الصور', icon: 'images', color: '#06B6D4' },
  { key: 'video', label: 'الفيديوهات', icon: 'videocam', color: '#DC2626' },
] as const;

// Student-simplified categories: the granular content types (voice/gallery/
// video/message/homework/ai_lesson) are merged into a single "محتوى" toggle
// so students don't drown in switches. Toggling it flips all six at once.
const STUDENT_GROUP_CONTENT = ['voice', 'gallery', 'video', 'message', 'homework', 'ai_lesson'] as const;

type SimpleCategory = {
  key: string;
  label: string;
  icon: string;
  color: string;
  groupKeys?: readonly string[]; // when set, toggling flips all these types at once
};

const STUDENT_CATEGORIES: SimpleCategory[] = [
  { key: 'announcement', label: 'الإعلانات', icon: 'megaphone', color: '#10B981' },
  { key: 'exam', label: 'الامتحانات والدرجات', icon: 'document-text', color: '#3B82F6', groupKeys: ['exam', 'grade'] },
  { key: 'attendance', label: 'الحضور', icon: 'calendar', color: '#6366F1' },
  { key: 'medical', label: 'التنبيهات الطبية', icon: 'medkit', color: '#EF4444' },
  { key: 'content', label: 'المحتوى (واجبات، رسائل، صوت، صور، فيديو)', icon: 'apps', color: '#7C3AED', groupKeys: STUDENT_GROUP_CONTENT },
];

export async function loadNotifPrefs(userId: string): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY(userId));
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      mutedTypes: Array.isArray(parsed?.mutedTypes) ? parsed.mutedTypes : [],
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotifPrefs(userId: string, prefs: NotifPrefs) {
  try {
    await AsyncStorage.setItem(PREFS_KEY(userId), JSON.stringify(prefs));
  } catch { /* silent */ }
}

/**
 * Pure helper — call from the notification realtime handler to decide whether
 * an incoming notification should appear in the UI.
 */
export function shouldDeliverNotification(prefs: NotifPrefs | null | undefined, notifType?: string | null): boolean {
  if (!notifType) return true;
  if (!prefs || !Array.isArray(prefs.mutedTypes)) return true;
  return !prefs.mutedTypes.includes(notifType);
}

export default function NotificationPreferences({ userId, variant = 'full' }: { userId: string | null | undefined; variant?: 'full' | 'student' }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    loadNotifPrefs(userId).then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, [userId]);

  const toggleType = async (type: string) => {
    const isMuted = prefs.mutedTypes.includes(type);
    const next: NotifPrefs = {
      mutedTypes: isMuted
        ? prefs.mutedTypes.filter((t) => t !== type)
        : [...prefs.mutedTypes, type],
    };
    setPrefs(next);
    if (userId) await saveNotifPrefs(userId, next);
  };

  const toggleGroup = async (keys: readonly string[], turnOn: boolean) => {
    const set = new Set(prefs.mutedTypes);
    if (turnOn) {
      keys.forEach((k) => set.delete(k));
    } else {
      keys.forEach((k) => set.add(k));
    }
    const next: NotifPrefs = { mutedTypes: Array.from(set) };
    setPrefs(next);
    if (userId) await saveNotifPrefs(userId, next);
  };

  const enableAll = async () => {
    const next: NotifPrefs = { mutedTypes: [] };
    setPrefs(next);
    if (userId) await saveNotifPrefs(userId, next);
  };

  if (!userId) return null;

  const rows: SimpleCategory[] = variant === 'student'
    ? STUDENT_CATEGORIES
    : CATEGORIES.map((c) => ({ ...c }));

  return (
    <View style={s.wrap}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>إعدادات الإشعارات</Text>
          <Text style={s.subtitle}>
            {prefs.mutedTypes.length === 0
              ? 'كل الإشعارات مُفعّلة'
              : `${prefs.mutedTypes.length} نوع مكتوم`}
          </Text>
        </View>
        {prefs.mutedTypes.length > 0 && (
          <TouchableOpacity onPress={enableAll} style={s.resetBtn}>
            <Text style={s.resetBtnText}>تفعيل الكل</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginVertical: 20 }} />
      ) : (
        <View style={{ gap: 6 }}>
          {rows.map((cat) => {
            const keys = cat.groupKeys ?? [cat.key];
            // For grouped rows: switch is ON iff at least one type in the group is not muted.
            const isOn = keys.some((k) => !prefs.mutedTypes.includes(k));
            return (
              <View key={cat.key} style={s.row}>
                <Switch
                  value={isOn}
                  onValueChange={() => {
                    if (cat.groupKeys) {
                      toggleGroup(cat.groupKeys, !isOn);
                    } else {
                      toggleType(cat.key);
                    }
                  }}
                  trackColor={{ false: '#E2E8F0', true: cat.color + '80' }}
                  thumbColor={isOn ? cat.color : '#CBD5E1'}
                />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={[s.label, { color: isOn ? Colors.text : Colors.textMuted }]}>
                    {cat.label}
                  </Text>
                </View>
                <View style={[s.iconWrap, { backgroundColor: cat.color + '15' }]}>
                  <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: Colors.border, gap: 10,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  title: { fontSize: 15, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  resetBtn: {
    backgroundColor: '#EEF2FF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  resetBtnText: { fontSize: 11, fontWeight: '800', color: '#4338CA' },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: 13, fontWeight: '700' },
});
