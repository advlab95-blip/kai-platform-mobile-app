/**
 * Interaction Settings Section — add to any settings page
 * Controls: animations, haptics, sounds, notification sound
 */
import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import { useInteractions } from '../../contexts/InteractionsContext';

export default function InteractionSettings() {
  const { settings, updateSettings } = useInteractions();

  const items = [
    { key: 'animationsEnabled' as const, label: 'الحركات والانتقالات', desc: 'تأثيرات بصرية سلسة عند التنقل والضغط', icon: 'sparkles' as const, color: '#8B5CF6' },
    { key: 'hapticsEnabled' as const, label: 'الاهتزاز التفاعلي', desc: 'اهتزاز خفيف عند الضغط والتأكيد', icon: 'phone-portrait' as const, color: '#3B82F6' },
    { key: 'soundsEnabled' as const, label: 'الأصوات التفاعلية', desc: 'أصوات بسيطة عند الأزرار والإجراءات', icon: 'volume-medium' as const, color: '#10B981' },
    { key: 'notificationSoundEnabled' as const, label: 'صوت الإشعارات', desc: 'صوت تنبيه عند وصول إشعار جديد', icon: 'notifications' as const, color: '#F59E0B' },
  ];

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Ionicons name="hand-left" size={20} color={Colors.primary} />
        <Text style={s.cardTitle}>التفاعلات</Text>
      </View>

      {items.map((item, i) => (
        <View key={item.key}>
          {i > 0 && <View style={s.divider} />}
          <View style={s.row}>
            <Switch
              value={settings[item.key]}
              onValueChange={(val) => updateSettings({ [item.key]: val })}
              trackColor={{ false: '#E2E8F0', true: `${item.color}40` }}
              thumbColor={settings[item.key] ? item.color : '#94A3B8'}
            />
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
  card: { backgroundColor: '#fff', borderRadius: 22, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: Colors.border },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 14 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 },
  info: { flex: 1, alignItems: 'flex-end', marginHorizontal: 12 },
  label: { fontSize: 14, fontWeight: '700', color: Colors.text, textAlign: 'right' },
  desc: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 },
  icon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 10 },
});
