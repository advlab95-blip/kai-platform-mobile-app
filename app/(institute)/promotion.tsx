import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, TextInput,
  KeyboardAvoidingView, Platform, Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { hapticSuccess } from '../../utils/performance';
import { confirmAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import { haptics } from '../../utils/haptics';

type PromotionMode = 'promote' | 'graduate';

export default function InstitutePromotion() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();
  const [classes, setClasses] = useState<any[]>([]);
  const [years, setYears] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Promotion flow
  const [showPromotion, setShowPromotion] = useState(false);
  const [mode, setMode] = useState<PromotionMode>('promote');
  const [fromGradeKey, setFromGradeKey] = useState('');     // normalized grade base name
  const [toGradeKey, setToGradeKey] = useState('');
  const [toClassId, setToClassId] = useState('');           // specific target section for promote
  const [students, setStudents] = useState<any[]>([]);
  const [excludeIds, setExcludeIds] = useState<Set<string>>(new Set());
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [deleteOnGraduate, setDeleteOnGraduate] = useState(false);

  // Normalize: strip trailing Arabic section letter so "السادس العلمي الإعدادية ب" → "السادس العلمي الإعدادية"
  const gradeBase = (name: string): string => {
    if (!name) return '';
    const m = name.match(/^(.*?)\s+[\u0621-\u064A]$/);
    return m ? m[1].trim() : name.trim();
  };

  // Group classes by normalized base name
  type GradeGroup = { key: string; label: string; classes: any[] };
  const gradeGroups: GradeGroup[] = React.useMemo(() => {
    const map = new Map<string, GradeGroup>();
    for (const cls of classes) {
      const key = gradeBase(cls.name);
      if (!map.has(key)) map.set(key, { key, label: key, classes: [] });
      map.get(key)!.classes.push(cls);
    }
    return Array.from(map.values());
  }, [classes]);

  const selectedFromGroup = gradeGroups.find(g => g.key === fromGradeKey);
  const selectedToGroup = gradeGroups.find(g => g.key === toGradeKey);

  // Detect if this is a "final grade" where promotion = graduation (e.g. السادس الإعدادي)
  const isFinalGrade = fromGradeKey.includes('السادس') && (fromGradeKey.includes('إعدادي') || fromGradeKey.includes('اعدادي'));

  // Academic year
  const [showNewYear, setShowNewYear] = useState(false);
  const [newYearName, setNewYearName] = useState('');
  const [creatingYear, setCreatingYear] = useState(false);

  // Logs tab
  const [showLogs, setShowLogs] = useState(false);

  const loadData = async () => {
    if (!userInstituteId) return;
    try {
      const [cls, yrs, lg] = await Promise.all([
        api.getClassesByInstitute(userInstituteId),
        api.getAcademicYears(userInstituteId),
        api.getPromotionLogs(userInstituteId),
      ]);
      setClasses(cls);
      setYears(yrs);
      setLogs(lg);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [userInstituteId]);
  const onRefresh = useCallback(async () => { haptics.light(); setRefreshing(true); try { await loadData(); } finally { setRefreshing(false); } }, [userInstituteId]);

  const currentYear = years.find(y => y.is_current);

  // Load students across ALL classes in the selected grade group (dedup by id)
  useEffect(() => {
    if (!selectedFromGroup || selectedFromGroup.classes.length === 0) { setStudents([]); return; }
    setLoadingStudents(true);
    (async () => {
      try {
        const results = await Promise.all(
          selectedFromGroup.classes.map((c: any) => api.getStudentsByClass(c.id, userInstituteId || undefined))
        );
        const seen = new Set<string>();
        const merged: any[] = [];
        for (const arr of results) {
          for (const s of (arr as any[])) {
            if (!seen.has(s.id)) { seen.add(s.id); merged.push(s); }
          }
        }
        setStudents(merged);
        setExcludeIds(new Set());
      } catch (err: any) {
        console.error('[promotion] load students', err);
        Alert.alert(
          t('common.error', { defaultValue: 'خطأ' }),
          err?.message || 'تعذّر تحميل قائمة الطلاب — تحقق من اتصالك',
        );
      } finally {
        setLoadingStudents(false);
      }
    })();
  }, [fromGradeKey, classes.length, userInstituteId]);

  const toggleExclude = (studentId: string) => {
    setExcludeIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId); else next.add(studentId);
      return next;
    });
  };

  const handlePromote = async () => {
    if (!selectedFromGroup || !userInstituteId || !userId) return;
    if (mode === 'promote' && !toClassId) { Alert.alert(t('common.error'), t('institute.selectTargetClass')); return; }
    if (!currentYear) { Alert.alert(t('common.error'), t('institute.createYearFirst')); return; }

    const fromClassIds = selectedFromGroup.classes.map(c => c.id);
    const promoteCount = students.length - excludeIds.size;
    const actionText = mode === 'promote' ? `ترفيع ${promoteCount} طالب` : `تخريج ${promoteCount} طالب`;

    // الإجراء الفعلي للترفيع/التخريج — يُستدعى بعد كل التأكيدات
    const runPromotion = async () => {
      setProcessing(true);
      try {
        let result: any;
        if (mode === 'promote') {
          result = await api.bulkPromoteByClass({
            instituteId: userInstituteId, fromClassIds, toClassId,
            excludeStudentIds: Array.from(excludeIds),
            academicYear: currentYear.name, promotedBy: userId,
          });
          hapticSuccess();
          Alert.alert(t('common.success'), `${result.promoted} ${t('institute.promote')}${result.repeated > 0 ? ` + ${result.repeated} ${t('institute.repeat')}` : ''}`);
        } else {
          result = await api.bulkGraduateStudents({
            instituteId: userInstituteId, classIds: fromClassIds,
            excludeStudentIds: Array.from(excludeIds),
            academicYear: currentYear.name, promotedBy: userId,
            deleteAccounts: deleteOnGraduate,
          });
          hapticSuccess();
          const extra = result.deleted ? ` (حُذفت ${result.deleted} حسابات)` : '';
          Alert.alert(t('common.success'), `${result.graduated} ${t('institute.graduate')}${extra}${result.repeated > 0 ? ` + ${result.repeated} ${t('institute.repeat')}` : ''}`);
        }
        setShowPromotion(false);
        setDeleteOnGraduate(false);
        loadData();
      } catch (err: any) { Alert.alert(t('common.error'), err.message || t('common.operationFailed')); } finally {
        setProcessing(false);
      }
    };

    // التأكيد الأول: تخريج/ترفيع
    confirmAlert(
      t('common.confirm'),
      `${actionText}${excludeIds.size > 0 ? ` (${excludeIds.size} ${t('institute.fail')})` : ''}?`,
      async () => {
        // التأكيد الثاني (منفصل) فقط عند تفعيل حذف الحسابات مع التخريج — عملية لا رجعة فيها
        if (mode === 'graduate' && deleteOnGraduate) {
          confirmAlert(
            'حذف نهائي',
            `حذف نهائي: سيتم حذف ${promoteCount} حساب طالب نهائياً مع كل بياناتهم. لا يمكن التراجع. متأكد؟`,
            runPromotion,
            true
          );
          return;
        }
        await runPromotion();
      },
      true
    );
  };

  const handleCreateYear = async () => {
    if (!newYearName.trim() || !userInstituteId) return;
    setCreatingYear(true);
    try {
      // Default: academic year starts on Sep 1 this year, ends on Jun 30 next year
      // (users can adjust later from the year detail screen)
      const now = new Date();
      const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1; // Jun+ starts new year
      const startDate = `${startYear}-09-01`;
      const endDate = `${startYear + 1}-06-30`;
      await api.createAcademicYear(userInstituteId, newYearName.trim(), startDate, endDate, true);
      hapticSuccess();
      Alert.alert(t('common.success'), t('institute.yearCreated'));
      setShowNewYear(false);
      setNewYearName('');
      await loadData();
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setCreatingYear(false);
    }
  };

  const handleCloseYear = (year: any) => {
    confirmAlert(t('institute.closeYear'), `${t('institute.closeYear')} "${year.name}"?\n\n${t('common.cannotUndo')}`, async () => {
      try {
        await api.closeAcademicYear(year.id);
        Alert.alert(t('common.success'), t('institute.yearClosed'));
        // await so refresh completes before user sees stale state
        await loadData();
      } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    }, true);
  };

  // Retry detect if not found yet
  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) {
      detectInstitute(userId);
    }
  }, [userInstituteId, userId, isFetching]);

  if (!userInstituteId) {
    return (
      <SafeAreaView style={s.container}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={{ fontSize: 14, color: '#64748B', marginTop: 12 }}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return <SafeAreaView style={s.container}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الترفيع"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 30, paddingTop: 12 }}>

        {/* Current Year Card */}
        <View style={s.yearCard}>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={s.yearLabel}>{t('institute.currentAcademicYear')}</Text>
            <Text style={s.yearName}>{currentYear?.name || t('institute.academicYearNotSet')}</Text>
          </View>
          <View style={{ gap: 6 }}>
            <TouchableOpacity style={s.yearBtn} onPress={() => setShowNewYear(true)}>
              <Ionicons name="add-circle" size={16} color="#fff" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{t('institute.newAcademicYear')}</Text>
            </TouchableOpacity>
            {currentYear && !currentYear.is_closed && (
              <TouchableOpacity style={[s.yearBtn, { backgroundColor: Colors.error }]} onPress={() => handleCloseYear(currentYear)}>
                <Ionicons name="lock-closed" size={14} color="#fff" />
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#fff' }}>{t('common.close')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Action Buttons */}
        <View style={{ paddingHorizontal: 16, gap: 10, marginBottom: 20 }}>
          <TouchableOpacity style={s.actionBtn} onPress={() => { setMode('promote'); setShowPromotion(true); setFromGradeKey(''); setToGradeKey(''); setToClassId(''); setDeleteOnGraduate(false); }}>
            <Ionicons name="arrow-up-circle" size={24} color="#fff" />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.actionTitle}>{t('institute.bulkPromotion')}</Text>
              <Text style={s.actionDesc}>{t('institute.bulkPromotionDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#DC2626' }]} onPress={() => { setMode('graduate'); setShowPromotion(true); setFromGradeKey(''); setDeleteOnGraduate(false); }}>
            <Ionicons name="school" size={24} color="#fff" />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.actionTitle}>{t('institute.bulkGraduation')}</Text>
              <Text style={s.actionDesc}>{t('institute.bulkGraduationDesc')}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={[s.actionBtn, { backgroundColor: '#7C3AED' }]} onPress={() => setShowLogs(true)}>
            <Ionicons name="time" size={24} color="#fff" />
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.actionTitle}>{t('institute.promotionLogs')}</Text>
              <Text style={s.actionDesc}>{logs.length} عملية مسجّلة</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Years History */}
        <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.text, textAlign: 'right', paddingHorizontal: 20, marginBottom: 8 }}>{t('institute.academicYears')}</Text>
        {years.length === 0 ? (
          <Text style={s.empty}>{t('institute.noAcademicYears')}</Text>
        ) : years.map(year => (
          <View key={year.id} style={s.yearItem}>
            <View style={[s.yearBadge, { backgroundColor: year.is_current ? '#ECFDF5' : year.is_closed ? '#FEE2E2' : '#F1F5F9' }]}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: year.is_current ? '#059669' : year.is_closed ? '#DC2626' : '#64748B' }}>
                {year.is_current ? t('institute.currentYear') : year.is_closed ? t('institute.closedYear') : t('institute.upcomingYear')}
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'right' }}>{year.name}</Text>
          </View>
        ))}
      </ScrollView>

      {/* ═══ Promotion Sheet ═══ */}
      <SwipeableSheet visible={showPromotion} onClose={() => { if (!processing) setShowPromotion(false); }} maxHeight={0.95}>
        <View style={s.sheetContent}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowPromotion(false)} accessibilityLabel="إغلاق">
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>
              {mode === 'promote' ? t('institute.bulkPromotion') : t('institute.bulkGraduation')}
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
            {!currentYear && (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Text style={{ flex: 1, fontSize: 13, color: '#92400E', textAlign: 'right' }}>{t('institute.createYearFirst')}</Text>
                <Ionicons name="warning" size={20} color="#B45309" />
              </View>
            )}

            {/* Source Grade (grouped — one pill per grade covers all its sections) */}
            <Text style={s.label}>{mode === 'promote' ? 'الصف المصدر' : 'صف التخريج'}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
              {gradeGroups.map(g => (
                <TouchableOpacity key={g.key} style={[s.chip, fromGradeKey === g.key && s.chipActive]} onPress={() => { setFromGradeKey(g.key); setToClassId(''); setToGradeKey(''); }}>
                  <Text style={[s.chipText, fromGradeKey === g.key && { color: '#fff' }]}>
                    {g.label} ({g.classes.length} شعبة)
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Final-grade graduation notice */}
            {mode === 'graduate' && isFinalGrade && (
              <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E', textAlign: 'right', marginBottom: 8 }}>
                  هذا الصف النهائي (الإعدادي). التخريج هنا يعني نهاية المسار الدراسي.
                </Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}
                  onPress={() => setDeleteOnGraduate(v => !v)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: deleteOnGraduate ? '#DC2626' : Colors.textSecondary }}>
                    حذف الحسابات والبيانات نهائياً
                  </Text>
                  <Ionicons name={deleteOnGraduate ? 'checkbox' : 'square-outline'} size={22} color={deleteOnGraduate ? '#DC2626' : Colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* Target Grade + Section (promote only) */}
            {mode === 'promote' && fromGradeKey && (
              <>
                <Text style={s.label}>الصف الهدف (الصف اللي راح ينتقلون إليه)</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                  {gradeGroups.filter(g => g.key !== fromGradeKey).map(g => (
                    <TouchableOpacity key={g.key} style={[s.chip, toGradeKey === g.key && { backgroundColor: '#059669' }]} onPress={() => { setToGradeKey(g.key); setToClassId(''); }}>
                      <Text style={[s.chipText, toGradeKey === g.key && { color: '#fff' }]}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {toGradeKey && selectedToGroup && selectedToGroup.classes.length > 0 && (
                  <>
                    <Text style={s.label}>الشعبة (بالصف الهدف)</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                      {selectedToGroup.classes.map((cls: any) => (
                        <TouchableOpacity key={cls.id} style={[s.chip, toClassId === cls.id && { backgroundColor: '#059669' }]} onPress={() => setToClassId(cls.id)}>
                          <Text style={[s.chipText, toClassId === cls.id && { color: '#fff' }]}>{cls.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </>
                )}
              </>
            )}

            {/* Students List */}
            {fromGradeKey && (
              <>
                <Text style={s.label}>
                  الطلاب ({students.length}) — اضغط على الراسبين لاستثنائهم
                </Text>
                {loadingStudents ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} /> : (
                  students.map((stu, i) => {
                    const isExcluded = excludeIds.has(stu.id);
                    return (
                      <TouchableOpacity key={stu.id} style={[s.studentRow, isExcluded && { backgroundColor: '#FEE2E2', borderColor: '#FECACA' }]} onPress={() => toggleExclude(stu.id)}>
                        <Ionicons name={isExcluded ? 'close-circle' : 'checkmark-circle'} size={22} color={isExcluded ? '#DC2626' : '#059669'} />
                        <Text style={[s.studentAction, { color: isExcluded ? '#DC2626' : '#059669' }]}>
                          {isExcluded ? t('institute.fail') : mode === 'promote' ? t('institute.promote') : t('institute.graduate')}
                        </Text>
                        <Text style={[s.studentName, isExcluded && { color: '#DC2626' }]}>{stu.full_name || stu.name || 'طالب'}</Text>
                        <Text style={s.studentNum}>{i + 1}</Text>
                      </TouchableOpacity>
                    );
                  })
                )}
              </>
            )}
          </ScrollView>

          {/* Action Button */}
          {fromGradeKey && students.length > 0 && (mode === 'graduate' || toClassId) && (
            <View style={s.bottomBar}>
              <TouchableOpacity style={[s.saveBtn, processing && { opacity: 0.6 }, mode === 'graduate' && { backgroundColor: '#DC2626' }]} onPress={handlePromote} disabled={processing}>
                {processing ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name={mode === 'promote' ? 'arrow-up-circle' : 'school'} size={20} color="#fff" />
                    <Text style={s.saveBtnText}>
                      {mode === 'promote'
                        ? `ترفيع ${students.length - excludeIds.size} طالب`
                        : `تخريج ${students.length - excludeIds.size} طالب`
                      }
                      {excludeIds.size > 0 ? ` + ${excludeIds.size} إعادة` : ''}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SwipeableSheet>

      {/* ═══ New Year Sheet ═══ */}
      <SwipeableSheet visible={showNewYear} onClose={() => setShowNewYear(false)} maxHeight={0.5}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={{ padding: 24 }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 16 }}>{t('institute.newAcademicYear')}</Text>
            <TextInput style={s.input} placeholder={t('institute.yearNamePlaceholder')} placeholderTextColor={Colors.textMuted} value={newYearName} onChangeText={setNewYearName} textAlign="right" />
            <TouchableOpacity style={[s.saveBtn, creatingYear && { opacity: 0.6 }]} onPress={handleCreateYear} disabled={creatingYear}>
              {creatingYear ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{t('institute.newAcademicYear')}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowNewYear(false)} style={{ alignSelf: 'center', marginTop: 10 }}>
              <Text style={{ color: Colors.textMuted }}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SwipeableSheet>

      {/* ═══ Logs Sheet ═══ */}
      <SwipeableSheet visible={showLogs} onClose={() => setShowLogs(false)} maxHeight={0.9}>
        <View style={s.sheetContent}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowLogs(false)} accessibilityLabel="إغلاق">
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>{t('institute.promotionLogs')}</Text>
          </View>
          <FlashList
            data={logs}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <View style={s.logItem}>
                <Ionicons
                  name={item.action === 'promote' ? 'arrow-up-circle' : item.action === 'graduate' ? 'school' : 'refresh-circle'}
                  size={20}
                  color={item.action === 'promote' ? '#059669' : item.action === 'graduate' ? '#DC2626' : '#F59E0B'}
                />
                <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{item.users?.full_name || 'طالب'}</Text>
                  <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                    {item.action === 'promote' ? `${item.from_class?.name} → ${item.to_class?.name}` :
                     item.action === 'graduate' ? `تخرج من ${item.from_class?.name}` :
                     `إعادة بـ ${item.from_class?.name}`}
                  </Text>
                  <Text style={{ fontSize: 9, color: '#94A3B8' }}>{item.academic_year} — {new Date(item.promoted_at).toLocaleDateString('ar-IQ')}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={<Text style={s.empty}>{t('institute.noPromotionLogs')}</Text>}
            contentContainerStyle={{ padding: 16 }}
          />
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  // Sheets only have a maxHeight (no fixed height), so children with `flex: 1`
  // collapse to nothing. Give the sheet body an explicit height that matches
  // the SwipeableSheet maxHeight ratio so the inner ScrollView gets real space.
  sheetContent: { height: SCREEN_HEIGHT * 0.85, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  yearCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 18, marginHorizontal: 16, marginBottom: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  yearLabel: { fontSize: 11, color: Colors.textMuted },
  yearName: { fontSize: 20, fontWeight: '900', color: Colors.primary },
  yearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#059669', borderRadius: 16, padding: 18 },
  actionTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  actionDesc: { fontSize: 11, color: 'rgba(255,255,255,0.7)', textAlign: 'right' },
  yearItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 14, marginHorizontal: 16, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
  yearBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 30 },
  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8 },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  studentRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  studentNum: { width: 24, textAlign: 'center', fontSize: 12, fontWeight: '800', color: Colors.textMuted },
  studentName: { flex: 1, textAlign: 'right', fontSize: 14, fontWeight: '700', color: Colors.text },
  studentAction: { fontSize: 11, fontWeight: '800' },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16 },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  overlayModal: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)', padding: 24 },
  overlayContent: { backgroundColor: '#fff', borderRadius: 24, padding: 24 },
  logItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: Colors.border },
});
