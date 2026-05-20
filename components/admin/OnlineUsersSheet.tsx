import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../shared/SwipeableSheet';
import { Colors } from '../../constants/colors';
import type { OnlineUserMeta } from '../../stores/presenceStore';
import { api } from '../../services/api';
import useDataStore from '../../stores/dataStore';

type Props = {
  visible: boolean;
  onClose: () => void;
  onlineUsers: OnlineUserMeta[];
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'الادمن',
  institute: 'إدارة',
  institute_admin: 'إدارة',
  teacher: 'أستاذ',
  student: 'طالب',
  parent: 'ولي أمر',
  cafeteria: 'كافتيريا',
  medical: 'طبيب',
};

const ROLE_COLOR: Record<string, string> = {
  admin: '#7C3AED',
  institute: '#2563EB',
  institute_admin: '#2563EB',
  teacher: '#0D9488',
  student: '#059669',
  parent: '#D97706',
  cafeteria: '#DC2626',
  medical: '#DB2777',
};

function timeAgo(iso: string): string {
  if (!iso) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `قبل ${minutes} د`;
  const hours = Math.floor(minutes / 60);
  return `قبل ${hours} س`;
}

export default function OnlineUsersSheet({ visible, onClose, onlineUsers }: Props) {
  const { institutes } = useDataStore();
  const [profiles, setProfiles] = useState<Record<string, { full_name: string }>>({});
  const [loading, setLoading] = useState(false);

  // Resolve user_ids → full_names whenever the sheet opens or the list changes.
  // Uses one batched query (api.getUsersByIds) instead of N round-trips.
  useEffect(() => {
    if (!visible || onlineUsers.length === 0) return;
    const ids = onlineUsers.map((u) => u.user_id);
    let alive = true;
    setLoading(true);
    api.getUsersByIds(ids)
      .then((rows) => {
        if (!alive) return;
        const map: Record<string, { full_name: string }> = {};
        for (const r of rows) map[r.id] = { full_name: r.full_name || '—' };
        setProfiles(map);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [visible, onlineUsers]);

  const instituteName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const i of institutes || []) map[i.id] = i.name;
    return map;
  }, [institutes]);

  return (
    <SwipeableSheet visible={visible} onClose={onClose} sheetStyle={s.sheet}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.iconCircle}>
            <View style={s.dot} />
          </View>
          <View>
            <Text style={s.title}>المتصل الآن</Text>
            <Text style={s.subtitle}>
              {onlineUsers.length === 0 ? 'لا يوجد أحد متصل' : `${onlineUsers.length} مستخدم متصل`}
            </Text>
          </View>
        </View>
      </View>

      {onlineUsers.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="cloud-offline-outline" size={42} color="#CBD5E1" />
          <Text style={s.emptyText}>لا يوجد مستخدمون متصلون حالياً</Text>
        </View>
      ) : (
        <FlatList
          data={onlineUsers}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={loading ? (
            <View style={{ paddingVertical: 8, alignItems: 'center' }}>
              <ActivityIndicator size="small" color={Colors.primary} />
            </View>
          ) : null}
          renderItem={({ item }) => {
            const profile = profiles[item.user_id];
            const name = profile?.full_name || '—';
            const roleLabel = ROLE_LABEL[item.role] || item.role;
            const roleColor = ROLE_COLOR[item.role] || Colors.primary;
            const inst = item.institute_id ? instituteName[item.institute_id] : null;
            return (
              <View style={s.row}>
                <View style={[s.avatar, { backgroundColor: roleColor + '20' }]}>
                  <Ionicons name="person" size={18} color={roleColor} />
                  <View style={s.onlineDot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.name} numberOfLines={1}>{name}</Text>
                  <Text style={s.meta} numberOfLines={1}>
                    <Text style={[s.role, { color: roleColor }]}>{roleLabel}</Text>
                    {inst ? ` · ${inst}` : ''}
                  </Text>
                </View>
                <Text style={s.timeAgo}>{timeAgo(item.online_at)}</Text>
              </View>
            );
          }}
        />
      )}
    </SwipeableSheet>
  );
}

const s = StyleSheet.create({
  sheet: { paddingHorizontal: 18 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconCircle: {
    width: 40, height: 40, borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center', justifyContent: 'center',
  },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#10B981' },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  empty: { alignItems: 'center', paddingVertical: 50, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0, right: 0,
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 2, borderColor: '#fff',
  },
  name: { fontSize: 13, fontWeight: '800', color: Colors.text, textAlign: 'right' },
  meta: { fontSize: 11, color: Colors.textMuted, marginTop: 2, textAlign: 'right' },
  role: { fontWeight: '700' },
  timeAgo: { fontSize: 11, color: Colors.textMuted },
});
