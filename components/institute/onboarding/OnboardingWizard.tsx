// OnboardingWizard — first-run guided setup for new institute admins.
//
// Surfaced as a full-screen modal (SwipeableSheet @ maxHeight 1.0). The sheet is
// non-dismissable via swipe/overlay tap so users can't half-swipe out of step 2
// by accident; the only exits are the top-right "تخطي" link and the completion
// button on step 5. Wiring (when/where to show it) lives OUTSIDE this file —
// see `hooks/useOnboardingGate.tsx`.
//
// Steps:
//   1. مرحبا            — welcome + institute name
//   2. السنة الدراسية   — create the current academic year (auto-skip if one exists)
//   3. الصفوف/القاعات   — add at least one class/room (label depends on institute type)
//   4. أول أستاذ        — optional: create the institute's first teacher account
//   5. اكتمل            — congrats + finish
//
// All Supabase calls go through the existing `api` service so RLS, institute_id
// filtering, and audit logging stay consistent with the rest of the app.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import SwipeableSheet from '../../shared/SwipeableSheet';
import { tokens } from '../../../constants/theme';
import { haptics } from '../../../utils/haptics';
import { api } from '../../../services/api';
import useDataStore from '../../../stores/dataStore';

// AsyncStorage key — per-institute so an admin who manages multiple institutes
// gets the wizard once per institute, not globally.
export const onboardingCompletedKey = (instituteId: string) => `@onboarding_completed_${instituteId}`;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Optional override — defaults to first institute in dataStore. */
  instituteId?: string;
};

type ClassDraft = { id: string; name: string };
type TeacherDraft = { id: string; full_name: string; code: string };

const TOTAL_STEPS = 5;

export default function OnboardingWizard({ visible, onClose, instituteId: instituteIdProp }: Props) {
  const { institutes } = useDataStore();
  const institute = useMemo(
    () => institutes.find((i) => i.id === instituteIdProp) || institutes[0],
    [institutes, instituteIdProp],
  );
  const instituteId = institute?.id;
  const isSchool = institute?.type === 'school';
  const classLabel = isSchool ? 'صف' : 'قاعة';
  const classLabelPlural = isSchool ? 'الصفوف' : 'القاعات';

  const [step, setStep] = useState(1);

  // Step 2 — academic year
  const defaultYearName = useMemo(() => {
    // Iraqi school year runs Sept→June. Suggest "YYYY-YYYY+1" based on current month.
    const now = new Date();
    const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
  }, []);
  const [yearName, setYearName] = useState(defaultYearName);
  const [yearCreating, setYearCreating] = useState(false);
  const [yearAlreadyExists, setYearAlreadyExists] = useState(false);
  const [yearCheckLoading, setYearCheckLoading] = useState(false);

  // Step 3 — classes
  const [newClassName, setNewClassName] = useState('');
  const [classes, setClasses] = useState<ClassDraft[]>([]);
  const [classAdding, setClassAdding] = useState(false);

  // Step 4 — first teacher
  const [teacherName, setTeacherName] = useState('');
  const [teacherPhone, setTeacherPhone] = useState('');
  const [teacherCode, setTeacherCode] = useState('');
  const [teacherCreating, setTeacherCreating] = useState(false);
  const [createdTeacher, setCreatedTeacher] = useState<TeacherDraft | null>(null);

  // Reset transient state every time the wizard opens — so re-entering doesn't
  // show stale data from a previous run.
  useEffect(() => {
    if (!visible) return;
    setStep(1);
    setYearName(defaultYearName);
    setNewClassName('');
    setClasses([]);
    setTeacherName('');
    setTeacherPhone('');
    setTeacherCode('');
    setCreatedTeacher(null);
    setYearAlreadyExists(false);
  }, [visible, defaultYearName]);

  // When entering step 2, check if a current academic year already exists —
  // skip the step entirely if so (admin shouldn't have to re-enter what's there).
  useEffect(() => {
    if (!visible || step !== 2 || !instituteId) return;
    let cancelled = false;
    setYearCheckLoading(true);
    api
      .getCurrentAcademicYear(instituteId)
      .then((existing) => {
        if (cancelled) return;
        if (existing) {
          setYearAlreadyExists(true);
          // Small delay so the user sees the "موجودة بالفعل" feedback before auto-advance.
          setTimeout(() => {
            if (!cancelled) setStep(3);
          }, 700);
        }
      })
      .catch(() => {
        /* silent — fallback to manual create */
      })
      .finally(() => {
        if (!cancelled) setYearCheckLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, step, instituteId]);

  const dismissForever = useCallback(async () => {
    if (instituteId) {
      try {
        await AsyncStorage.setItem(onboardingCompletedKey(instituteId), '1');
      } catch {
        /* silent — worst case the wizard reappears once */
      }
    }
    onClose();
  }, [instituteId, onClose]);

  const handleSkip = useCallback(() => {
    haptics.light();
    Alert.alert(
      'تخطّي الإعداد',
      'تستطيع إكمال الإعداد لاحقاً من شاشة الإعدادات. متأكّد من التخطّي؟',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'تخطّي',
          style: 'destructive',
          onPress: () => {
            dismissForever();
          },
        },
      ],
    );
  }, [dismissForever]);

  const handleCreateYear = useCallback(async () => {
    if (!instituteId) return;
    const name = yearName.trim();
    if (!name) {
      Alert.alert('تنبيه', 'اكتب اسم السنة الدراسية أولاً (مثال: 2026-2027)');
      return;
    }
    setYearCreating(true);
    try {
      // Pick sane defaults so the row passes any NOT NULL constraints —
      // admin can fine-tune dates later from "السنة الدراسية" screen.
      const [startStr] = name.split('-');
      const startYear = Number(startStr) || new Date().getFullYear();
      const startDate = `${startYear}-09-01`;
      const endDate = `${startYear + 1}-06-30`;
      await api.createAcademicYear(instituteId, name, startDate, endDate, true);
      haptics.success();
      setStep(3);
    } catch (err: any) {
      haptics.error();
      Alert.alert('فشل الإنشاء', err?.message || 'تعذّر إنشاء السنة الدراسية');
    } finally {
      setYearCreating(false);
    }
  }, [instituteId, yearName]);

  const handleAddClass = useCallback(async () => {
    if (!instituteId) return;
    const name = newClassName.trim();
    if (!name) return;
    setClassAdding(true);
    try {
      const created: any = await api.createClass(name, instituteId);
      const id = created?.id || `tmp-${Date.now()}`;
      setClasses((prev) => [...prev, { id, name }]);
      setNewClassName('');
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('فشل', err?.message || `تعذّر إضافة الـ${classLabel}`);
    } finally {
      setClassAdding(false);
    }
  }, [instituteId, newClassName, classLabel]);

  const handleCreateTeacher = useCallback(async () => {
    if (!instituteId) return;
    const name = teacherName.trim();
    const code = teacherCode.trim();
    if (!name) {
      Alert.alert('تنبيه', 'الاسم الكامل مطلوب');
      return;
    }
    if (!code) {
      Alert.alert('تنبيه', 'رمز الدخول مطلوب — أعطه للأستاذ بعد الإنشاء');
      return;
    }
    setTeacherCreating(true);
    try {
      const res = await api.createUser(code, 'teacher', name, instituteId, undefined, undefined, instituteId);
      setCreatedTeacher({ id: res.userId, full_name: name, code: res.code || code });
      haptics.success();
    } catch (err: any) {
      haptics.error();
      Alert.alert('فشل الإنشاء', err?.message || 'تعذّر إنشاء حساب الأستاذ');
    } finally {
      setTeacherCreating(false);
    }
  }, [instituteId, teacherName, teacherCode]);

  const goNext = () => {
    haptics.selection();
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  };

  const renderProgress = () => (
    <View style={styles.progressRow}>
      {Array.from({ length: TOTAL_STEPS }).map((_, idx) => {
        const n = idx + 1;
        const active = n <= step;
        const current = n === step;
        return (
          <View
            key={n}
            style={[
              styles.progressDot,
              active && styles.progressDotActive,
              current && styles.progressDotCurrent,
            ]}
          />
        );
      })}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerRow}>
      <Text style={styles.headerCounter}>{`الخطوة ${step} من ${TOTAL_STEPS}`}</Text>
      {step < TOTAL_STEPS ? (
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.skipLink}>تخطّي</Text>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 40 }} />
      )}
    </View>
  );

  // ── Step bodies ─────────────────────────────────────────────────

  const renderStep1 = () => (
    <View style={styles.stepWrap}>
      <View style={[styles.bigIconWrap, { backgroundColor: tokens.brand[100] }]}>
        <Ionicons name="school" size={84} color={tokens.brand[500]} />
      </View>
      <Text style={styles.stepTitle}>أهلاً بك في كاي</Text>
      <Text style={styles.stepSubtitle}>
        {institute?.name ? `سنُجهّز ${institute.name} خطوة بخطوة.` : 'سنُجهّز مؤسستك خطوة بخطوة.'}
      </Text>
      <Text style={styles.stepHint}>
        يستغرق الإعداد دقيقتين فقط. تقدر تتخطى أي خطوة وتُكمل لاحقاً.
      </Text>
      <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>ابدأ</Text>
        <Ionicons name="arrow-back" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderStep2 = () => (
    <View style={styles.stepWrap}>
      <View style={[styles.bigIconWrap, { backgroundColor: tokens.semantic.infoBg }]}>
        <Ionicons name="calendar" size={68} color={tokens.semantic.info} />
      </View>
      <Text style={styles.stepTitle}>السنة الدراسية</Text>
      <Text style={styles.stepSubtitle}>أنشئ السنة الحالية ليرتبط بها كل شيء (الجداول، الدرجات، الحضور).</Text>

      {yearCheckLoading ? (
        <View style={{ marginTop: 24, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={tokens.brand[500]} />
          <Text style={styles.stepHint}>جاري الفحص...</Text>
        </View>
      ) : yearAlreadyExists ? (
        <View style={styles.successBanner}>
          <Ionicons name="checkmark-circle" size={22} color={tokens.semantic.success} />
          <Text style={styles.successBannerText}>السنة الدراسية موجودة بالفعل — نتخطى هذه الخطوة...</Text>
        </View>
      ) : (
        <>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>اسم السنة</Text>
            <TextInput
              value={yearName}
              onChangeText={setYearName}
              placeholder="مثال: 2026-2027"
              placeholderTextColor={tokens.text[4]}
              style={styles.input}
              textAlign="right"
              autoCapitalize="none"
              editable={!yearCreating}
            />
          </View>
          <TouchableOpacity
            style={[styles.primaryBtn, yearCreating && styles.primaryBtnDisabled]}
            onPress={handleCreateYear}
            disabled={yearCreating}
            activeOpacity={0.85}
          >
            {yearCreating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Text style={styles.primaryBtnText}>إنشاء</Text>
                <Ionicons name="checkmark" size={18} color="#fff" />
              </>
            )}
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  const renderStep3 = () => (
    <View style={styles.stepWrap}>
      <View style={[styles.bigIconWrap, { backgroundColor: tokens.semantic.purpleBg }]}>
        <Ionicons name="grid" size={68} color={tokens.semantic.purple} />
      </View>
      <Text style={styles.stepTitle}>{classLabelPlural}</Text>
      <Text style={styles.stepSubtitle}>
        {isSchool
          ? 'المدارس تستخدم "الصفوف" (مثل: الأول الابتدائي ‌أ). أضف صفًّا واحدًا على الأقل.'
          : 'المعاهد تستخدم "القاعات" (مثل: قاعة A1). أضف قاعة واحدة على الأقل.'}
      </Text>

      <View style={styles.addRow}>
        <TextInput
          value={newClassName}
          onChangeText={setNewClassName}
          placeholder={isSchool ? 'اسم الصف' : 'اسم القاعة'}
          placeholderTextColor={tokens.text[4]}
          style={[styles.input, { flex: 1 }]}
          textAlign="right"
          editable={!classAdding}
          onSubmitEditing={handleAddClass}
        />
        <TouchableOpacity
          style={[styles.addBtn, (!newClassName.trim() || classAdding) && styles.primaryBtnDisabled]}
          onPress={handleAddClass}
          disabled={!newClassName.trim() || classAdding}
          activeOpacity={0.85}
        >
          {classAdding ? <ActivityIndicator color="#fff" /> : <Ionicons name="add" size={20} color="#fff" />}
        </TouchableOpacity>
      </View>

      {classes.length > 0 && (
        <View style={styles.listWrap}>
          <Text style={styles.listTitle}>{`المُضافة (${classes.length})`}</Text>
          {classes.map((c) => (
            <View key={c.id} style={styles.listRow}>
              <View style={styles.listIconWrap}>
                <Ionicons name="checkmark" size={14} color={tokens.semantic.success} />
              </View>
              <Text style={styles.listName}>{c.name}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, classes.length === 0 && styles.primaryBtnDisabled]}
        onPress={goNext}
        disabled={classes.length === 0}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>التالي</Text>
        <Ionicons name="arrow-back" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderStep4 = () => (
    <View style={styles.stepWrap}>
      <View style={[styles.bigIconWrap, { backgroundColor: tokens.semantic.warningBg }]}>
        <Ionicons name="person" size={68} color={tokens.semantic.warning} />
      </View>
      <Text style={styles.stepTitle}>أول أستاذ</Text>
      <Text style={styles.stepSubtitle}>
        أنشئ حساب أول أستاذ في مؤسستك. تستطيع تخطّي هذه الخطوة وإضافة الأساتذة لاحقًا من شاشة المستخدمين.
      </Text>

      {createdTeacher ? (
        <View style={styles.teacherCreatedCard}>
          <View style={styles.teacherCheck}>
            <Ionicons name="checkmark-circle" size={36} color={tokens.semantic.success} />
          </View>
          <Text style={styles.teacherCreatedTitle}>{`تم إنشاء حساب ${createdTeacher.full_name}`}</Text>
          <Text style={styles.teacherCreatedHint}>أعطِ الأستاذ الرمز التالي ليسجّل دخوله:</Text>
          <View style={styles.codeBox}>
            <Text style={styles.codeText} selectable>{createdTeacher.code}</Text>
          </View>
          <TouchableOpacity style={styles.primaryBtn} onPress={goNext} activeOpacity={0.85}>
            <Text style={styles.primaryBtnText}>التالي</Text>
            <Ionicons name="arrow-back" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>الاسم الكامل</Text>
            <TextInput
              value={teacherName}
              onChangeText={setTeacherName}
              placeholder="مثال: أحمد محمد"
              placeholderTextColor={tokens.text[4]}
              style={styles.input}
              textAlign="right"
              editable={!teacherCreating}
            />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>رقم الهاتف (اختياري)</Text>
            <TextInput
              value={teacherPhone}
              onChangeText={setTeacherPhone}
              placeholder="07XX XXX XXXX"
              placeholderTextColor={tokens.text[4]}
              style={styles.input}
              textAlign="right"
              keyboardType="phone-pad"
              editable={!teacherCreating}
            />
          </View>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>رمز الدخول</Text>
            <TextInput
              value={teacherCode}
              onChangeText={setTeacherCode}
              placeholder="مثال: 4521"
              placeholderTextColor={tokens.text[4]}
              style={styles.input}
              textAlign="right"
              autoCapitalize="none"
              editable={!teacherCreating}
            />
          </View>

          <View style={styles.btnRow}>
            <TouchableOpacity
              style={[styles.secondaryBtn, teacherCreating && styles.primaryBtnDisabled]}
              onPress={goNext}
              disabled={teacherCreating}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryBtnText}>تخطّي</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1 }, teacherCreating && styles.primaryBtnDisabled]}
              onPress={handleCreateTeacher}
              disabled={teacherCreating}
              activeOpacity={0.85}
            >
              {teacherCreating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>إنشاء الحساب</Text>
                  <Ionicons name="person-add" size={18} color="#fff" />
                </>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  const renderStep5 = () => (
    <View style={styles.stepWrap}>
      <View style={[styles.bigIconWrap, { backgroundColor: tokens.semantic.successBg }]}>
        <Ionicons name="checkmark-circle" size={92} color={tokens.semantic.success} />
      </View>
      <Text style={styles.stepTitle}>تم الإعداد!</Text>
      <Text style={styles.stepSubtitle}>كل شيء جاهز. مؤسستك الآن مُعدّة وجاهزة للاستخدام.</Text>
      <Text style={styles.stepHint}>
        تقدر تستورد الطلاب دفعةً واحدة من شاشة "استيراد دفعي" بدل إدخالهم يدويًا.
      </Text>
      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: tokens.semantic.success }]}
        onPress={dismissForever}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>ابدأ استخدام المنصة</Text>
        <Ionicons name="rocket" size={18} color="#fff" />
      </TouchableOpacity>
    </View>
  );

  const renderStepBody = () => {
    if (!instituteId) {
      return (
        <View style={[styles.stepWrap, { paddingVertical: 60 }]}>
          <ActivityIndicator color={tokens.brand[500]} />
          <Text style={[styles.stepHint, { marginTop: 12 }]}>جاري تحميل المؤسسة...</Text>
        </View>
      );
    }
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return null;
    }
  };

  return (
    <SwipeableSheet
      visible={visible}
      onClose={() => {
        // Block backdrop/swipe-driven close until the final step. Once the user
        // hits step 5 we treat onClose as "ابدأ" — but the user *should* go
        // through the explicit completion button so we persist the flag there.
        if (step === TOTAL_STEPS) {
          dismissForever();
        }
      }}
      maxHeight={1.0}
      minHeight={1.0}
      swipeDownDisabled
      overlayTapDisabled
      sheetStyle={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}
    >
      <View style={styles.container}>
        {renderHeader()}
        {renderProgress()}
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderStepBody()}
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18 },

  headerRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    marginBottom: 12,
  },
  headerCounter: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.text[3],
  },
  skipLink: {
    fontSize: 14,
    fontWeight: '700',
    color: tokens.brand[500],
    paddingVertical: 4,
    paddingHorizontal: 6,
  },

  progressRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.border[1],
  },
  progressDotActive: {
    backgroundColor: tokens.brand[500],
  },
  progressDotCurrent: {
    width: 24,
  },

  scrollContent: { paddingBottom: 40, flexGrow: 1 },
  stepWrap: { alignItems: 'center', paddingTop: 12, gap: 14 },
  bigIconWrap: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: tokens.text[1],
    textAlign: 'center',
  },
  stepSubtitle: {
    fontSize: 14,
    color: tokens.text[2],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  stepHint: {
    fontSize: 12,
    color: tokens.text[3],
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 12,
  },

  fieldWrap: {
    width: '100%',
    gap: 6,
    marginTop: 4,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.text[2],
    textAlign: 'right',
  },
  input: {
    backgroundColor: tokens.surface.surface,
    borderWidth: 1,
    borderColor: tokens.border[1],
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    fontSize: 15,
    color: tokens.text[1],
    textAlign: 'right',
    ...tokens.shadow.xs,
  },

  primaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: tokens.brand[500],
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: tokens.radius.lg,
    marginTop: 14,
    minWidth: '70%',
    ...tokens.shadow.md,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryBtn: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.surface.surface2,
    borderWidth: 1,
    borderColor: tokens.border[1],
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.lg,
    marginTop: 14,
  },
  secondaryBtnText: {
    color: tokens.text[2],
    fontSize: 14,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row-reverse',
    gap: 10,
    width: '100%',
  },

  addRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    marginTop: 8,
  },
  addBtn: {
    width: 50,
    height: 50,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.brand[500],
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.xs,
  },

  listWrap: {
    width: '100%',
    backgroundColor: tokens.surface.surface2,
    borderRadius: tokens.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
    marginTop: 6,
  },
  listTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.text[3],
    textAlign: 'right',
    marginBottom: 2,
  },
  listRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  listIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: tokens.semantic.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listName: {
    flex: 1,
    fontSize: 13,
    color: tokens.text[1],
    fontWeight: '600',
    textAlign: 'right',
  },

  successBanner: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 10,
    backgroundColor: tokens.semantic.successBg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.md,
    marginTop: 14,
    width: '100%',
  },
  successBannerText: {
    flex: 1,
    fontSize: 13,
    color: tokens.semantic.success,
    fontWeight: '700',
    textAlign: 'right',
  },

  teacherCreatedCard: {
    width: '100%',
    backgroundColor: tokens.semantic.successBg,
    borderRadius: tokens.radius.lg,
    padding: 18,
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  teacherCheck: { marginBottom: 4 },
  teacherCreatedTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.semantic.success,
    textAlign: 'center',
  },
  teacherCreatedHint: {
    fontSize: 12,
    color: tokens.text[2],
    textAlign: 'center',
  },
  codeBox: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: tokens.semantic.success,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    paddingHorizontal: 30,
    marginVertical: 8,
  },
  codeText: {
    fontSize: 28,
    fontWeight: '900',
    color: tokens.semantic.success,
    letterSpacing: 4,
  },
});

