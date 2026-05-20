import React, { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import {
  getInstituteNotifSettings,
  updateInstituteNotifSettings,
} from '../../services/pushNotifications';

type ToggleKey =
  | 'notify_attendance'
  | 'notify_grades'
  | 'notify_assignments'
  | 'notify_fees'
  | 'notify_admin_ads'
  | 'notify_messages';

type Settings = Record<ToggleKey, boolean>;

const DEFAULTS: Settings = {
  notify_attendance: true,
  notify_grades: true,
  notify_assignments: true,
  notify_fees: true,
  notify_admin_ads: true,
  notify_messages: true,
};

interface Props {
  instituteId: string;
}

// Institute-level notification toggles. Read by the send-push edge function
// through notification_type_enabled() — unchecked category = push skipped but
// notification row is still written, so users still see it in the center.
export default function NotificationSettings({ instituteId }: Props) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<ToggleKey | null>(null);

  useEffect(() => {
    if (!instituteId) return;
    let alive = true;
    (async () => {
      try {
        const data = await getInstituteNotifSettings(instituteId);
        if (!alive) return;
        if (data) {
          setSettings({
            notify_attendance:  data.notify_attendance  ?? true,
            notify_grades:      data.notify_grades      ?? true,
            notify_assignments: data.notify_assignments ?? true,
            notify_fees:        data.notify_fees        ?? true,
            notify_admin_ads:   data.notify_admin_ads   ?? true,
            notify_messages:    data.notify_messages    ?? true,
          });
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [instituteId]);

  const toggle = async (key: ToggleKey, value: boolean) => {
    const prev = settings[key];
    setSettings((s) => ({ ...s, [key]: value }));
    setSaving(key);
    try {
      await updateInstituteNotifSettings(instituteId, { [key]: value });
    } catch {
      // Revert optimistic update on failure
      setSettings((s) => ({ ...s, [key]: prev }));
    } finally {
      setSaving(null);
    }
  };

  const items: { key: ToggleKey; label: string; desc: string; icon: keyof typeof Ionicons.glyphMap; color: string }[] = [
    { key: 'notify_attendance',  label: 'الحضور والغياب',  desc: 'إشعار أولياء الأمور عند غياب الطالب',        icon: 'calendar-outline',    color: '#4F46E5' },
    { key: 'notify_grades',      label: 'الدرجات',          desc: 'إشعار الطالب وولي الأمر بالدرجات الجديدة',    icon: 'school-outline',      color: '#8B5CF6' },
    { key: 'notify_assignments', label: 'الواجبات',         desc: 'إشعار الطلاب بالواجبات الجديدة',              icon: 'document-text-outline', color: '#0EA5E9' },
    { key: 'notify_fees',        label: 'الأقساط المالية',  desc: 'إشعار أولياء الأمور بالأقساط المتأخرة',       icon: 'card-outline',        color: '#F59E0B' },
    { key: 'notify_admin_ads',   label: 'الإعلانات الإدارية', desc: 'إشعار بالإعلانات والتعاميم من الإدارة',      icon: 'megaphone-outline',   color: '#10B981' },
    { key: 'notify_messages',    label: 'الرسائل',          desc: 'إشعار بالرسائل الجديدة في المحادثات',         icon: 'chatbubble-outline',  color: '#EF4444' },
  ];

  if (loading) {
    return (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 24 }]}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name="notifications-outline" size={20} color={Colors.primary} />
        <Text style={s.cardTitle}>إعدادات الإشعارات</Text>
      </View>

      <Text style={s.hint}>
        التحكم بأنواع الإشعارات التي ترسلها المنصة لمستخدمي المعهد. الإيقاف يمنع إرسال الدفع فقط — الإشعارات تظل متاحة داخل التطبيق.
      </Text>

      {items.map((item, i) => (
        <View key={item.key}>
          {i > 0 && <View style={s.divider} />}
          <View style={s.row}>
            {saving === item.key ? (
              <ActivityIndicator size="small" color={item.color} style={{ width: 51 }} />
            ) : (
              <Switch
                value={settings[item.key]}
                onValueChange={(val) => toggle(item.key, val)}
                trackColor={{ false: '#E2E8F0', true: `${item.color}40` }}
                thumbColor={settings[item.key] ? item.color : '#94A3B8'}
                accessibilityLabel={item.label}
              />
            )}
            <View style={s.info}>
              <Text style={s.label}>{item.label}</Text>
              <Text style={s.desc}>{item.desc}</Text>
            </View>
            <View style={[s.icon, { backgroundColor: `${item.color}15` }]}>
              <Ionicons name={item.icon} size={18} color={item.color} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  hint: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', lineHeight: 18, marginBottom: 12 },
  row: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, paddingVertical: 10 },
  info: { flex: 1 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  desc: { fontSize: 11, color: Colors.textSecondary, textAlign: 'right', marginTop: 2 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: Colors.border, opacity: 0.5 },
});
