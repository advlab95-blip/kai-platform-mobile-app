import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useFeatureFlagsStore, { FEATURE_DEFINITIONS } from '../../stores/featureFlagsStore';
import { api } from '../../services/api';
import { supabase, supabaseAdmin } from '../../services/supabase';
import { useTranslation } from 'react-i18next';
import { confirmAlert } from '../../utils/alerts';
import { haptics } from '../../utils/haptics';

export default function AdminFeatures() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { institutes, loadInstitutes } = useDataStore();
  const { allFlags, loadAllFlags, isLoading } = useFeatureFlagsStore();
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInst, setSelectedInst] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [logData, setLogData] = useState<any[]>([]);

  useEffect(() => {
    loadAllFlags();
    if (institutes.length === 0) loadInstitutes();
  }, []);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadAllFlags(); } finally { setRefreshing(false); }
  }, []);

  const handleToggle = async (instituteId: string, featureKey: string, currentValue: boolean) => {
    const def = FEATURE_DEFINITIONS[featureKey];
    const featureName = def?.name || featureKey;
    const inst = institutes.find(i => i.id === instituteId);
    const instituteName = (inst as any)?.name || '';
    const action = currentValue ? 'تعطيل' : 'تفعيل';
    const impact = currentValue
      ? `سيختفي هذا القسم فوراً من كل مستخدمي مؤسسة "${instituteName}".`
      : `سيظهر هذا القسم فوراً لكل مستخدمي مؤسسة "${instituteName}".`;

    // Prevent accidental flip — confirm before the feature flag changes, since a single
    // swipe previously toggled visibility for every user in the institute immediately.
    confirmAlert(
      `${action} ${featureName}`,
      `${impact}\n\nمتابعة؟`,
      async () => {
        setToggling(`${instituteId}_${featureKey}`);
        try {
          await api.toggleFeatureFlag(instituteId, featureKey, !currentValue, userId || '');
          // Audit: admins toggling features must be traceable (who/when/what)
          api.logAdminAction({
            actorId: userId || '',
            actorRole: 'admin',
            action: currentValue ? 'disable_feature' : 'enable_feature',
            targetType: 'feature_flag',
            targetId: featureKey,
            targetName: featureName,
            instituteId,
            metadata: { previous: currentValue, next: !currentValue },
          }).catch(() => {});
          await loadAllFlags();
        } catch (err: any) {
          Alert.alert(t('common.error'), err.message || t('admin.updateFailed'));
        } finally {
          setToggling(null);
        }
      },
      currentValue, // red button when disabling (destructive from users' POV)
    );
  };

  const loadLog = async (instId: string) => {
    try {
      const data = await api.getFeatureFlagsLog(instId);
      setLogData(data);
      setShowLog(true);
    } catch { setLogData([]); }
  };

  // Filter flags by selected institute
  const filteredFlags = selectedInst
    ? allFlags.filter(f => f.institute_id === selectedInst)
    : [];

  // Group institutes
  const instList = institutes.map(inst => ({
    ...inst,
    flagCount: allFlags.filter(f => f.institute_id === inst.id && f.is_enabled).length,
    totalFlags: allFlags.filter(f => f.institute_id === inst.id).length,
  }));

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.featureManagement')}
        subtitle={t('admin.enableDisableFeatures')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >

        {isLoading && !refreshing && (
          <ActivityIndicator color={Colors.primary} style={{ paddingVertical: 30 }} />
        )}

        {/* Institute list */}
        {!selectedInst ? (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={s.sectionTitle}>{t('admin.selectInstitution')}</Text>
            {instList.map((inst) => (
              <TouchableOpacity
                key={inst.id}
                style={s.instCard}
                onPress={() => setSelectedInst(inst.id)}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                  <View style={{ backgroundColor: '#ECFDF5', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>
                      {inst.flagCount}/{inst.totalFlags} {t('admin.enabledCount')}
                    </Text>
                  </View>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={s.instName}>{inst.name}</Text>
                  <Text style={s.instType}>{(inst as any).type === 'school' ? t('admin.school') : t('admin.institutionType')}</Text>
                </View>
                <View style={[s.instIcon, (inst as any).type === 'school' ? { backgroundColor: '#FFF7ED' } : {}]}>
                  <Ionicons
                    name={(inst as any).type === 'school' ? 'school' : 'business'}
                    size={20}
                    color={(inst as any).type === 'school' ? '#B45309' : Colors.primary}
                  />
                </View>
              </TouchableOpacity>
            ))}
            {instList.length === 0 && (
              <Text style={s.emptyText}>{t('admin.noInstitutions')}</Text>
            )}
          </View>
        ) : (
          /* Feature flags for selected institute */
          <View style={{ paddingHorizontal: 16 }}>
            {/* Back button + institute name */}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}
              onPress={() => { setSelectedInst(''); setShowLog(false); }}
            >
              <Ionicons name="arrow-forward" size={20} color={Colors.primary} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.primary }}>
                {institutes.find(i => i.id === selectedInst)?.name}
              </Text>
            </TouchableOpacity>

            {/* Tab: Features / Log */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
              <TouchableOpacity
                style={[s.tab, !showLog && s.tabActive]}
                onPress={() => setShowLog(false)}
              >
                <Ionicons name="toggle" size={16} color={!showLog ? '#fff' : Colors.textMuted} />
                <Text style={[s.tabText, !showLog && s.tabTextActive]}>{t('admin.featuresTab')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tab, showLog && s.tabActive]}
                onPress={() => loadLog(selectedInst)}
              >
                <Ionicons name="time" size={16} color={showLog ? '#fff' : Colors.textMuted} />
                <Text style={[s.tabText, showLog && s.tabTextActive]}>{t('admin.featureLog')}</Text>
              </TouchableOpacity>
            </View>

            {!showLog ? (
              /* Features list */
              <>
                {/* ═══ Regular Features ═══ */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textSecondary, textAlign: 'right', marginBottom: 8 }}>الميزات الأساسية</Text>
                {Object.entries(FEATURE_DEFINITIONS).filter(([key]) => !key.startsWith('ai_')).map(([key, def]) => {
                  const flag = filteredFlags.find(f => f.feature_key === key);
                  const isOn = flag?.is_enabled === true;
                  const isToggling = toggling === `${selectedInst}_${key}`;
                  const inst = institutes.find(i => i.id === selectedInst);
                  const isSchool = (inst as any)?.type === 'school';
                  const isBlocked = (def.instituteOnly && isSchool) || (def.schoolOnly && !isSchool);

                  return (
                    <View key={key} style={[s.featureCard, isBlocked && { opacity: 0.4 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* Toggle */}
                        <View style={{ marginRight: 12 }}>
                          {isToggling ? (
                            <ActivityIndicator size="small" color={Colors.primary} />
                          ) : (
                            <Switch
                              value={isOn}
                              onValueChange={() => {
                                if (isBlocked) {
                                  Alert.alert(t('admin.unavailable'), def.instituteOnly ? t('admin.instituteOnly') : t('admin.schoolOnly'));
                                  return;
                                }
                                handleToggle(selectedInst, key, isOn);
                              }}
                              trackColor={{ false: '#E2E8F0', true: `${def.color}60` }}
                              thumbColor={isOn ? def.color : '#94A3B8'}
                              disabled={isBlocked}
                            />
                          )}
                        </View>

                        {/* Info */}
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            {isBlocked && (
                              <View style={{ backgroundColor: '#FEF2F2', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                                <Text style={{ fontSize: 9, fontWeight: '700', color: Colors.error }}>
                                  {def.instituteOnly ? t('admin.institutesOnly') : t('admin.schoolsOnly')}
                                </Text>
                              </View>
                            )}
                            <Text style={s.featureName}>{def.name}</Text>
                          </View>
                          <Text style={s.featureDesc}>{def.description}</Text>
                          {isOn && flag?.enabled_at && (
                            <Text style={{ fontSize: 10, color: '#059669', marginTop: 2 }}>
                              {t('admin.enabledSince')} {new Date(flag.enabled_at).toLocaleDateString('ar-IQ')}
                            </Text>
                          )}
                        </View>

                        {/* Icon */}
                        <View style={[s.featureIcon, { backgroundColor: `${def.color}15` }]}>
                          <Ionicons name={def.icon as any} size={22} color={def.color} />
                        </View>
                      </View>
                    </View>
                  );
                })}

                {/* ═══ AI Features Section ═══ */}
                <View style={{ marginTop: 20, marginBottom: 8, backgroundColor: '#F5F3FF', borderRadius: 18, padding: 16, borderWidth: 1, borderColor: '#DDD6FE' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: '#7C3AED' }}>🤖 ميزات الذكاء الاصطناعي</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#6B7280', textAlign: 'right', lineHeight: 18 }}>
                    تفعيل أي ميزة يفعّلها لكل أساتذة وطلاب المؤسسة تلقائياً
                  </Text>
                </View>

                {Object.entries(FEATURE_DEFINITIONS).filter(([key]) => key.startsWith('ai_')).map(([key, def]) => {
                  const flag = filteredFlags.find(f => f.feature_key === key);
                  const isOn = flag?.is_enabled === true;
                  const isToggling = toggling === `${selectedInst}_${key}`;
                  const targetRoles: string[] = (flag as any)?.target_roles || ['teacher', 'student'];
                  const forTeachers = targetRoles.includes('teacher');
                  const forStudents = targetRoles.includes('student');

                  // Update target_roles via API (not direct Supabase) — keeps validation + audit
                  // logging centralized. Removing the last role doesn't auto-disable the feature
                  // (removing the last role used to silently disable the feature globally — a trap).
                  const updateTargetRoles = async (role: string, enabled: boolean) => {
                    const newRoles = enabled
                      ? [...targetRoles.filter(r => r !== role), role]
                      : targetRoles.filter(r => r !== role);
                    try {
                      await api.updateFeatureFlagTargetRoles(selectedInst, key, newRoles, userId || '');
                      await loadAllFlags();
                      if (newRoles.length === 0 && isOn) {
                        // Non-blocking hint — the feature is still "enabled" but has no audience
                        Alert.alert(
                          t('common.warning', { defaultValue: 'تنبيه' }),
                          t('admin.noTargetRoleWarning', { defaultValue: 'الميزة مفعّلة لكن ما في أي دور مستهدف — لن تظهر لأي مستخدم.' })
                        );
                      }
                    } catch (err: any) { Alert.alert(t('common.error'), err.message); }
                  };

                  return (
                    <View key={key} style={[s.featureCard, { borderLeftWidth: 3, borderLeftColor: '#7C3AED' }]}>
                      {/* Header: Icon + Name + Main Toggle */}
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <View style={{ marginRight: 12 }}>
                          {isToggling ? (
                            <ActivityIndicator size="small" color="#7C3AED" />
                          ) : (
                            <Switch
                              value={isOn}
                              onValueChange={() => handleToggle(selectedInst, key, isOn)}
                              trackColor={{ false: '#E2E8F0', true: '#C4B5FD' }}
                              thumbColor={isOn ? '#7C3AED' : '#94A3B8'}
                            />
                          )}
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{ backgroundColor: '#F5F3FF', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>AI</Text>
                            </View>
                            <Text style={s.featureName}>{def.name}</Text>
                          </View>
                          <Text style={s.featureDesc}>{def.description}</Text>
                        </View>
                        <View style={[s.featureIcon, { backgroundColor: '#F5F3FF' }]}>
                          <Ionicons name={def.icon as any} size={22} color="#7C3AED" />
                        </View>
                      </View>

                      {/* Target Roles — only show when enabled */}
                      {isOn && (
                        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#EDE9FE' }}>
                          {(def as any).teacherOnly ? (
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#4F46E5', textAlign: 'right', marginBottom: 6 }}>👨‍🏫 للأساتذة فقط</Text>
                          ) : (def as any).studentOnly ? (
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669', textAlign: 'right', marginBottom: 6 }}>👨‍🎓 للطلاب فقط</Text>
                          ) : (
                            <>
                              <Text style={{ fontSize: 10, fontWeight: '700', color: '#6B7280', textAlign: 'right', marginBottom: 6 }}>مفعّلة لـ:</Text>
                              <View style={{ flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }}>
                                <TouchableOpacity
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: forStudents ? '#DCFCE7' : '#F1F5F9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: forStudents ? '#059669' : '#E2E8F0' }}
                                  onPress={() => updateTargetRoles('student', !forStudents)}
                                >
                                  <Ionicons name={forStudents ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={forStudents ? '#059669' : '#94A3B8'} />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: forStudents ? '#059669' : '#94A3B8' }}>الطلاب</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: forTeachers ? '#EEF2FF' : '#F1F5F9', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1.5, borderColor: forTeachers ? '#4F46E5' : '#E2E8F0' }}
                                  onPress={() => updateTargetRoles('teacher', !forTeachers)}
                                >
                                  <Ionicons name={forTeachers ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={forTeachers ? '#4F46E5' : '#94A3B8'} />
                                  <Text style={{ fontSize: 11, fontWeight: '700', color: forTeachers ? '#4F46E5' : '#94A3B8' }}>الأساتذة</Text>
                                </TouchableOpacity>
                              </View>
                            </>
                          )}

                          {/* Usage Stats Button */}
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 8, backgroundColor: '#EDE9FE', borderRadius: 10, paddingVertical: 8 }}
                            onPress={async () => {
                              try {
                                const client = supabaseAdmin || supabase;
                                // Get usage for this institute — try multiple column names
                                const featureName = key.replace('ai_', '');
                                let data: any[] = [];
                                // Try with institute_id — project only columns the aggregation uses.
                                const r1 = await client.from('ai_usage_log').select('tokens_used, cost_usd, feature, created_at, user_id, institute_id').eq('institute_id', selectedInst).limit(10000);
                                if (r1.data?.length) {
                                  data = r1.data.filter((r: any) => (r.feature || '').includes(featureName));
                                }
                                // If no data, try getting all for this institute's users
                                if (data.length === 0) {
                                  const { data: enrollments } = await client.from('enrollments').select('user_id').eq('institute_id', selectedInst);
                                  const userIds = (enrollments || []).map((e: any) => e.user_id);
                                  if (userIds.length > 0) {
                                    const r2 = await client.from('ai_usage_log').select('tokens_used, cost_usd, feature, created_at, user_id').in('user_id', userIds).limit(10000);
                                    data = (r2.data || []).filter((r: any) => !featureName || (r.feature || '').includes(featureName));
                                  }
                                }
                                const totalTokens = data.reduce((sum: number, r: any) => sum + (r.tokens_used || 0), 0);
                                const totalCost = data.reduce((sum: number, r: any) => sum + (r.cost_usd || 0), 0);
                                const thisMonth = data.filter((r: any) => {
                                  const d = new Date(r.created_at);
                                  const now = new Date();
                                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                                });
                                const monthTokens = thisMonth.reduce((sum: number, r: any) => sum + (r.tokens_used || 0), 0);
                                const monthCost = thisMonth.reduce((sum: number, r: any) => sum + (r.cost_usd || 0), 0);

                                Alert.alert(
                                  '📊 تقرير استهلاك API',
                                  `📌 ${def.name}\n` +
                                  `\n📅 هذا الشهر:\n` +
                                  `   طلبات: ${thisMonth.length}\n` +
                                  `   توكنز: ${monthTokens.toLocaleString()}\n` +
                                  `   تكلفة: $${monthCost.toFixed(4)}\n` +
                                  `\n📊 الإجمالي:\n` +
                                  `   طلبات: ${data.length}\n` +
                                  `   توكنز: ${totalTokens.toLocaleString()}\n` +
                                  `   تكلفة: $${totalCost.toFixed(4)}`
                                );
                              } catch (err) {
                                console.error(err);
                                Alert.alert('📊', 'لا توجد بيانات استخدام بعد لهذه المؤسسة');
                              }
                            }}
                          >
                            <Ionicons name="bar-chart" size={14} color="#7C3AED" />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED' }}>📊 تقرير استهلاك API</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              /* Change log */
              <>
                {logData.length === 0 ? (
                  <Text style={s.emptyText}>{t('admin.noChangeLog')}</Text>
                ) : (
                  logData.map((entry, i) => {
                    const def = FEATURE_DEFINITIONS[entry.feature_key];
                    return (
                      <View key={i} style={s.logCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                            {new Date(entry.changed_at).toLocaleString('ar-IQ')}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={{
                              backgroundColor: entry.new_value ? '#ECFDF5' : '#FEF2F2',
                              borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2,
                            }}>
                              <Text style={{
                                fontSize: 10, fontWeight: '700',
                                color: entry.new_value ? '#059669' : Colors.error,
                              }}>
                                {entry.new_value ? t('admin.enableAction') : t('admin.disableAction')}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>
                              {def?.name || entry.feature_key}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, textAlign: 'right' },
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
    backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: Colors.border,
  },
  featureIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginLeft: 12,
  },
  featureName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  featureDesc: { fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2, lineHeight: 18 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#F1F5F9',
  },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: '#fff' },
  logCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 6,
    borderWidth: 1, borderColor: Colors.border,
  },
  emptyText: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 40 },
});
