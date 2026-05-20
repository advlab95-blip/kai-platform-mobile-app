import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput, Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { haptics } from '../../utils/haptics';
import { searchMatch } from '../../hooks/useSmartSearch';
import PdfExportButton from '../../components/institute/PdfExportButton';

/**
 * Admin audit log — browsable history of every privileged action (user deletion,
 * branch deletion, institute deletion, feature-flag change, etc.) written via
 * api.logAdminAction. Filterable by action type. Read-only: entries are appended
 * server-side and never edited/deleted from the UI.
 */

type AuditEntry = {
  id: string;
  actor_id: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  institute_id: string | null;
  metadata: any;
  created_at: string;
};

const ACTION_COLORS: Record<string, { bg: string; fg: string; icon: any; label: string }> = {
  delete_user: { bg: '#FEE2E2', fg: '#B91C1C', icon: 'trash-outline', label: 'حذف مستخدم' },
  delete_branch: { bg: '#FEE2E2', fg: '#B91C1C', icon: 'git-branch-outline', label: 'حذف فرع' },
  delete_institute: { bg: '#FEE2E2', fg: '#B91C1C', icon: 'business-outline', label: 'حذف مؤسسة' },
  create_user: { bg: '#D1FAE5', fg: '#065F46', icon: 'person-add-outline', label: 'إنشاء مستخدم' },
  create_institute: { bg: '#D1FAE5', fg: '#065F46', icon: 'add-circle-outline', label: 'إنشاء مؤسسة' },
  transfer_user: { bg: '#DBEAFE', fg: '#1E40AF', icon: 'swap-horizontal-outline', label: 'نقل مستخدم' },
  update_feature_flag: { bg: '#EDE9FE', fg: '#6D28D9', icon: 'flash-outline', label: 'تعديل ميزة' },
  freeze_account: { bg: '#FEF3C7', fg: '#92400E', icon: 'snow-outline', label: 'تجميد حساب' },
  unfreeze_account: { bg: '#DBEAFE', fg: '#1E40AF', icon: 'sunny-outline', label: 'إلغاء تجميد' },
};

function actionMeta(action: string) {
  return ACTION_COLORS[action] || {
    bg: '#F1F5F9', fg: Colors.textMuted, icon: 'ellipsis-horizontal', label: action,
  };
}

export default function AdminAudit() {
  const { userId } = useAuthStore();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.getAdminAuditLog({ limit: 200 });
      setEntries(data as AuditEntry[]);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  // Distinct actions from loaded entries — keeps the filter bar honest (only shows
  // action types the admin actually has entries for).
  const availableActions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => set.add(e.action));
    return Array.from(set);
  }, [entries]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter) list = list.filter(e => e.action === filter);
    if (search.trim()) {
      const q = search.trim();
      list = list.filter(e =>
        searchMatch(e.target_name, q)
        || searchMatch(e.target_id, q)
        || searchMatch(e.actor_id, q)
      );
    }
    return list;
  }, [entries, filter, search]);

  const renderEntry = ({ item }: { item: AuditEntry }) => {
    const meta = actionMeta(item.action);
    const when = new Date(item.created_at);
    const dateStr = when.toLocaleDateString('ar-IQ');
    const timeStr = when.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' });
    // Inline metadata summary — shows the most useful context without opening a detail view.
    const metaPairs: string[] = [];
    if (item.metadata && typeof item.metadata === 'object') {
      for (const [k, v] of Object.entries(item.metadata)) {
        if (v == null || v === '') continue;
        metaPairs.push(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
      }
    }
    return (
      <View style={s.entry}>
        <View style={[s.iconWrap, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon} size={18} color={meta.fg} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <Text style={[s.actionLabel, { color: meta.fg }]}>{meta.label}</Text>
            <Text style={s.timeText}>{timeStr}</Text>
          </View>
          {item.target_name && (
            <Text style={s.targetText} numberOfLines={1}>
              🎯 {item.target_name}
            </Text>
          )}
          {metaPairs.length > 0 && (
            <Text style={s.metaText} numberOfLines={2}>
              {metaPairs.slice(0, 3).join(' · ')}
            </Text>
          )}
          <Text style={s.footerText}>
            {dateStr} · {item.actor_role}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="سجل العمليات"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        fallbackRoute="/(admin)/services"
      />
      <View style={{ padding: 16 }}>
        <View style={s.header}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.headerTitle}>سجل المراجعة</Text>
            <Text style={s.headerSubtitle}>
              كل عملية حرجة مسجّلة — {entries.length} إدخال
            </Text>
          </View>
          <View style={s.headerIcon}>
            <Ionicons name="shield-checkmark" size={24} color="#7C3AED" />
          </View>
        </View>

        {/* Export the filtered list as PDF/CSV. Useful for compliance reviews
            or sharing a slice with another admin. */}
        {filtered.length > 0 && (
          <View style={{ alignItems: 'flex-end', marginBottom: 10 }}>
            <PdfExportButton
              title="سجل العمليات"
              filename={`admin_audit_${new Date().toISOString().slice(0, 10)}`}
              columns={[
                { key: 'when',         label: 'التوقيت' },
                { key: 'action_label', label: 'العملية' },
                { key: 'actor_role',   label: 'الدور' },
                { key: 'target_name',  label: 'الهدف' },
                { key: 'institute_id', label: 'المؤسسة' },
              ]}
              data={filtered.map((e) => ({
                when: new Date(e.created_at).toLocaleString('ar-IQ'),
                action_label: actionMeta(e.action).label,
                actor_role: e.actor_role || '—',
                target_name: e.target_name || '—',
                institute_id: e.institute_id || '—',
              }))}
              label="تصدير"
            />
          </View>
        )}

        <View style={s.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={s.searchInput}
            placeholder="بحث بالاسم أو المُعرّف..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={setSearch}
            textAlign="right"
          />
        </View>

        {availableActions.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginTop: 10, flexGrow: 0 }}
            contentContainerStyle={{ gap: 6 }}
          >
            <TouchableOpacity
              style={[s.chip, filter === '' && s.chipActive]}
              onPress={() => setFilter('')}
            >
              <Text style={[s.chipText, filter === '' && { color: '#fff' }]}>الكل</Text>
            </TouchableOpacity>
            {availableActions.map(act => {
              const m = actionMeta(act);
              const active = filter === act;
              return (
                <TouchableOpacity
                  key={act}
                  style={[s.chip, active && { backgroundColor: m.fg }]}
                  onPress={() => setFilter(act)}
                >
                  <Ionicons name={m.icon} size={12} color={active ? '#fff' : m.fg} />
                  <Text style={[s.chipText, active && { color: '#fff' }]}>{m.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
      ) : filtered.length === 0 ? (
        <View style={s.empty}>
          <Ionicons name="file-tray-outline" size={48} color="#CBD5E1" />
          <Text style={s.emptyText}>
            {entries.length === 0 ? 'لا توجد عمليات مسجّلة بعد' : 'لا توجد نتائج'}
          </Text>
        </View>
      ) : (
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderEntry}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  headerSubtitle: { fontSize: 11, color: Colors.textMuted, textAlign: 'right' },
  headerIcon: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: '#F5F3FF',
    alignItems: 'center', justifyContent: 'center',
  },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },

  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 100,
    backgroundColor: '#F1F5F9',
  },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },

  entry: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  iconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  actionLabel: { fontSize: 13, fontWeight: '900' },
  timeText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },
  targetText: { fontSize: 12, color: Colors.text, textAlign: 'right', fontWeight: '600' },
  metaText: { fontSize: 10, color: Colors.textMuted, textAlign: 'right', fontStyle: 'italic' },
  footerText: { fontSize: 10, color: Colors.textMuted, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },
});
