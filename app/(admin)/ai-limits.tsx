import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import KeyboardAwareScroll from '../../components/shared/KeyboardAwareScroll';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import { supabase, supabaseAdmin } from '../../services/supabase';
import { haptics } from '../../utils/haptics';

const FEATURES: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'chat', label: 'محادثة AI', icon: 'chatbubble-ellipses', color: '#8B5CF6' },
  { key: 'summary', label: 'ملخصات', icon: 'document-text', color: '#3B82F6' },
  { key: 'quiz', label: 'توليد أسئلة', icon: 'help-circle', color: '#F59E0B' },
  { key: 'study_guide', label: 'دليل مذاكرة', icon: 'map', color: '#10B981' },
  { key: 'mindmap', label: 'خرائط ذهنية', icon: 'git-network', color: '#EC4899' },
];

const ROLES: { key: 'student' | 'teacher'; label: string; icon: string; color: string }[] = [
  { key: 'student', label: 'الطلاب', icon: 'school-outline', color: '#059669' },
  { key: 'teacher', label: 'الأساتذة', icon: 'person-outline', color: '#4F46E5' },
];

type LimitRow = { id?: string; institute_id: string; role: string; feature: string; daily_limit: number };

export default function AdminAILimits() {
  const { institutes, loadInstitutes } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedInst, setSelectedInst] = useState('');
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({}); // key = `${role}_${feature}`

  useEffect(() => { if (institutes.length === 0) loadInstitutes(); }, []);

  const loadLimits = useCallback(async (instId: string) => {
    setLoading(true);
    try {
      const client = supabaseAdmin || supabase;
      const { data, error } = await client
        .from('institute_ai_role_limits')
        .select('*')
        .eq('institute_id', instId);
      if (error) throw error;
      setLimits(data || []);
      const d: Record<string, string> = {};
      (data || []).forEach((row: any) => {
        d[`${row.role}_${row.feature}`] = String(row.daily_limit);
      });
      setDraft(d);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تحميل الحدود');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (selectedInst) loadLimits(selectedInst); }, [selectedInst, loadLimits]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (selectedInst) await loadLimits(selectedInst);
    } finally {
      setRefreshing(false);
    }
  }, [selectedInst, loadLimits]);

  const getValue = (role: string, feature: string): string => {
    const key = `${role}_${feature}`;
    if (draft[key] !== undefined) return draft[key];
    const row = limits.find(l => l.role === role && l.feature === feature);
    return row ? String(row.daily_limit) : '5';
  };

  const setValue = (role: string, feature: string, value: string) => {
    setDraft(prev => ({ ...prev, [`${role}_${feature}`]: value.replace(/[^0-9]/g, '') }));
  };

  const handleSave = async () => {
    if (!selectedInst) return;
    // Validate all 10 values
    const rows: LimitRow[] = [];
    for (const r of ROLES) {
      for (const f of FEATURES) {
        const raw = getValue(r.key, f.key);
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 10000) {
          Alert.alert('قيمة غير صالحة', `${r.label} — ${f.label}: الرقم غير صحيح (0-10000)`);
          return;
        }
        rows.push({ institute_id: selectedInst, role: r.key, feature: f.key, daily_limit: n });
      }
    }
    setSaving(true);
    try {
      const client = supabaseAdmin || supabase;
      const { error } = await client
        .from('institute_ai_role_limits')
        .upsert(rows, { onConflict: 'institute_id,role,feature' });
      if (error) throw error;
      Alert.alert('تم', 'تم حفظ الحدود بنجاح');
      await loadLimits(selectedInst);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل الحفظ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="حدود استخدام AI"
        subtitle="عدد مرات استخدام كل ميزة AI يومياً لكل دور (طالب / أستاذ) في كل مؤسسة"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <KeyboardAwareScroll
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >

        {!selectedInst ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={s.sectionTitle}>اختر المؤسسة</Text>
            {institutes.map((inst: any) => (
              <TouchableOpacity
                key={inst.id}
                style={s.instCard}
                onPress={() => setSelectedInst(inst.id)}
                activeOpacity={0.7}
              >
                <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={s.instName}>{inst.name}</Text>
                  <Text style={s.instType}>
                    {inst.type === 'school' ? 'مدرسة' : 'معهد'}
                  </Text>
                </View>
                <View style={s.instIcon}>
                  <Ionicons name={inst.type === 'school' ? 'school' : 'business'} size={20} color={Colors.primary} />
                </View>
              </TouchableOpacity>
            ))}
            {institutes.length === 0 && (
              <Text style={s.emptyText}>لا توجد مؤسسات</Text>
            )}
          </View>
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
              onPress={() => { setSelectedInst(''); setLimits([]); setDraft({}); }}
            >
              <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.primary }}>
                {(institutes.find((i: any) => i.id === selectedInst) as any)?.name}
              </Text>
            </TouchableOpacity>

            {loading ? (
              <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 40 }} />
            ) : (
              <>
                {FEATURES.map((f) => (
                  <View key={f.key} style={s.featureCard}>
                    <View style={s.featureHeader}>
                      <View style={[s.featureIcon, { backgroundColor: `${f.color}15` }]}>
                        <Ionicons name={f.icon as any} size={22} color={f.color} />
                      </View>
                      <Text style={s.featureName}>{f.label}</Text>
                    </View>
                    <View style={s.rolesRow}>
                      {ROLES.map((r) => (
                        <View key={r.key} style={s.roleBox}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 6 }}>
                            <Ionicons name={r.icon as any} size={14} color={r.color} />
                            <Text style={[s.roleLabel, { color: r.color }]}>{r.label}</Text>
                          </View>
                          <TextInput
                            style={s.numInput}
                            keyboardType="number-pad"
                            value={getValue(r.key, f.key)}
                            onChangeText={(v) => setValue(r.key, f.key, v)}
                            maxLength={5}
                            textAlign="center"
                            placeholder="5"
                            placeholderTextColor={Colors.textMuted}
                          />
                          <Text style={s.perDay}>طلب/يوم</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}

                <TouchableOpacity
                  style={[s.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.8}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="save" size={18} color="#fff" />
                      <Text style={s.saveBtnText}>حفظ الحدود</Text>
                    </>
                  )}
                </TouchableOpacity>

                <View style={s.infoBox}>
                  <Ionicons name="information-circle" size={16} color="#6366F1" />
                  <Text style={s.infoText}>
                    الحد يعاد احتسابه كل منتصف ليل. وضع الرقم 0 = تعطيل كامل للميزة لهذا الدور.
                  </Text>
                </View>
              </>
            )}
          </View>
        )}
      </KeyboardAwareScroll>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 12 },
  instCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  instIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#EEF2FF',
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  instName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  instType: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  featureCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  featureHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 10, marginBottom: 12,
  },
  featureIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  featureName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  rolesRow: {
    flexDirection: 'row', gap: 10,
  },
  roleBox: {
    flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14,
    padding: 10, alignItems: 'center',
    borderWidth: 1, borderColor: Colors.border,
  },
  roleLabel: { fontSize: 11, fontWeight: '800' },
  numInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8,
    fontSize: 18, fontWeight: '900', color: Colors.text,
    minWidth: 70, textAlign: 'center',
  },
  perDay: { fontSize: 9, color: Colors.textMuted, marginTop: 4, fontWeight: '600' },
  saveBtn: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 12, marginTop: 14,
  },
  infoText: { fontSize: 11, color: '#4F46E5', flex: 1, textAlign: 'right', lineHeight: 18 },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 40 },
});
