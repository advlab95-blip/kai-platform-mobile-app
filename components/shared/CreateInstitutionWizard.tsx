import React, { useMemo, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  Alert, KeyboardAvoidingView, Platform, I18nManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '../../constants/colors';
import { tokens } from '../../constants/designTokens';
import { api } from '../../services/api';
import { copyToClipboard } from '../../utils/clipboard';
import PrimaryButton from '../teacher/buttons/PrimaryButton';
import SwipeableSheet from './SwipeableSheet';
import KeyboardAwareScroll from './KeyboardAwareScroll';

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

type InstType = 'institute' | 'school';

interface Props {
  visible: boolean;
  onClose: () => void;
  onCreated?: (res: { type: InstType; name: string; adminCode?: string; warning?: string }) => void;
  callerUserId: string;
}

// Canonical stage catalogue. `key` is the server-side name expected by the
// `create_school` Edge Function. `order_num` mirrors the server seeding so the
// optional client-side fallback (if a future ENV ever wants to seed locally)
// stays consistent. Server is the source of truth for grades.
const STAGE_CATALOGUE = [
  {
    key: 'الابتدائية',
    label: 'المرحلة الابتدائية',
    desc: '٦ صفوف · من الأول إلى السادس الابتدائي',
    icon: 'book-outline' as const,
  },
  {
    key: 'المتوسطة',
    label: 'المرحلة المتوسطة',
    desc: '٣ صفوف · من الأول إلى الثالث المتوسط',
    icon: 'school-outline' as const,
  },
  {
    key: 'الإعدادية',
    label: 'المرحلة الإعدادية (الثانوية)',
    desc: '٣ صفوف · الرابع · الخامس · السادس',
    icon: 'library-outline' as const,
  },
] as const;

// RTL-aware chevron — in an RTL layout the "back/forward" semantics flip.
// On Arabic devices we want a back-button that visually points right (→)
// so it follows the reading order. Ionicons gives us both names.
const BACK_CHEVRON: keyof typeof Ionicons.glyphMap = I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';
const NEXT_CHEVRON: keyof typeof Ionicons.glyphMap = I18nManager.isRTL ? 'chevron-back' : 'chevron-forward';

// ─────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────

export default function CreateInstitutionWizard({ visible, onClose, onCreated, callerUserId }: Props) {
  const [step, setStep] = useState(1);
  const [type, setType] = useState<InstType | null>(null);
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [stages, setStages] = useState<string[]>(() => STAGE_CATALOGUE.map((s) => s.key));
  const [adminName, setAdminName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);

  // Institutes skip the stage-picker (step 3). Compute the visible step index
  // (1-based) and total so the indicator stays accurate for both flows.
  const totalSteps = type === 'school' ? 5 : 4;
  const visibleStepIndex = useMemo(() => {
    if (type !== 'school' && step >= 4) return step - 1;
    return step;
  }, [step, type]);

  const reset = useCallback(() => {
    setStep(1);
    setType(null);
    setName('');
    setCity('');
    setStages(STAGE_CATALOGUE.map((s) => s.key));
    setAdminName('');
    setAdminPhone('');
    setBusy(false);
    setCreatedCode(null);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, reset, onClose]);

  const goNext = useCallback(() => {
    if (step === 1) {
      if (!type) { Alert.alert('تنبيه', 'اختر نوع المؤسسة أولاً'); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      if (!name.trim()) { Alert.alert('تنبيه', 'اكتب اسم المؤسسة'); return; }
      if (!city.trim()) { Alert.alert('تنبيه', 'اكتب اسم المدينة'); return; }
      setStep(type === 'school' ? 3 : 4);
      return;
    }
    if (step === 3) {
      if (stages.length === 0) { Alert.alert('تنبيه', 'اختر مرحلة واحدة على الأقل'); return; }
      setStep(4);
      return;
    }
    if (step === 4) {
      if (!adminName.trim()) { Alert.alert('تنبيه', 'اكتب اسم الأدمن'); return; }
      setStep(5);
    }
  }, [step, type, name, city, stages, adminName]);

  const goBack = useCallback(() => {
    if (busy) return;
    if (step === 5) { setStep(4); return; }
    if (step === 4) { setStep(type === 'school' ? 3 : 2); return; }
    if (step === 3) { setStep(2); return; }
    if (step === 2) { setStep(1); return; }
  }, [busy, step, type]);

  const toggleStage = useCallback((key: string) => {
    setStages((prev) => (prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]));
  }, []);

  // ───────────────────────────────────────────────────────────────────────
  // Submit — creates institute/school + seeds default sections (schools only).
  // institute_id used for seeding is read from the server response, NEVER
  // trusted from local state. This is the multi-tenant invariant.
  // ───────────────────────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    if (!type) return;
    setBusy(true);
    try {
      let result: any;
      if (type === 'institute') {
        result = await api.createInstitute(name.trim(), city.trim(), callerUserId);
      } else {
        // Server seeds stages + grades + subjects from `stages` we send.
        result = await api.createSchool(name.trim(), city.trim(), callerUserId, stages);

        // Post-create: seed one default section "أ" per grade. We trust ONLY
        // the institute_id from the create response — never anything the
        // client computed locally. Failures here are non-fatal: the school
        // still exists; admin can add sections manually from settings.
        const newInstituteId: string | undefined = result?.id;
        if (newInstituteId && typeof newInstituteId === 'string' && newInstituteId.length >= 36) {
          try {
            await api.seedDefaultSectionsForSchool(newInstituteId);
          } catch (seedErr: any) {
            if (__DEV__) console.warn('[seedDefaultSections]', seedErr?.message);
            // Surface as warning in the success screen instead of failing
            // the whole flow — the structure is recoverable.
            result.warning = (result.warning ? result.warning + ' · ' : '')
              + 'تم إنشاء المدرسة لكن فشل إنشاء الشُعب الافتراضية — أضفها يدوياً';
          }
        }
      }
      const adminCode = result?.adminCode;
      setCreatedCode(adminCode || null);
      onCreated?.({ type, name: name.trim(), adminCode, warning: result?.warning });
    } catch (e: any) {
      Alert.alert('خطأ', e?.message || 'فشل إنشاء المؤسسة');
    } finally {
      setBusy(false);
    }
  }, [type, name, city, stages, callerUserId, onCreated]);

  const copyCode = useCallback(async () => {
    if (!createdCode) return;
    const ok = await copyToClipboard(createdCode);
    if (ok) Alert.alert('تم', 'تم نسخ الرمز');
  }, [createdCode]);

  // ───────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────
  return (
    <SwipeableSheet
      visible={visible}
      onClose={handleClose}
      maxHeight={0.94}
      overlayTapDisabled={busy}
      swipeDownDisabled={busy}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kavWrap}
      >
        <View style={styles.sheetInner}>
          {/* ── Header ─────────────────────────────────────────── */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleClose}
              disabled={busy}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="إغلاق"
              hitSlop={8}
            >
              <Ionicons name={BACK_CHEVRON} size={22} color={busy ? Colors.textMuted : Colors.text} />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <Text style={styles.title}>
                {createdCode ? 'تم الإنشاء بنجاح' : 'إنشاء مؤسسة جديدة'}
              </Text>
              {!createdCode && (
                <Text style={styles.subtitle}>
                  الخطوة {visibleStepIndex} من {totalSteps}
                </Text>
              )}
            </View>

            {/* spacer to balance the chevron on the other side (RTL-safe) */}
            <View style={styles.iconBtnSpacer} />
          </View>

          {/* ── Card-based step indicators ────────────────────── */}
          {!createdCode && (
            <View style={styles.progressRow}>
              {Array.from({ length: totalSteps }).map((_, i) => {
                const isPast = i < visibleStepIndex - 1;
                const isCurrent = i === visibleStepIndex - 1;
                return (
                  <View
                    key={i}
                    style={[
                      styles.progressPill,
                      isPast && styles.progressPillPast,
                      isCurrent && styles.progressPillCurrent,
                    ]}
                  />
                );
              })}
            </View>
          )}

          <KeyboardAwareScroll
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {createdCode ? (
              <SuccessView
                type={type!}
                instName={name.trim()}
                code={createdCode}
                onCopy={copyCode}
                onDone={handleClose}
              />
            ) : (
              <>
                {step === 1 && (
                  <StepType type={type} onSelect={setType} />
                )}

                {step === 2 && (
                  <StepBasic
                    type={type!}
                    name={name}
                    city={city}
                    onChangeName={setName}
                    onChangeCity={setCity}
                    disabled={busy}
                  />
                )}

                {step === 3 && type === 'school' && (
                  <StepStages selected={stages} onToggle={toggleStage} disabled={busy} />
                )}

                {step === 4 && (
                  <StepAdmin
                    type={type!}
                    adminName={adminName}
                    adminPhone={adminPhone}
                    onChangeName={setAdminName}
                    onChangePhone={setAdminPhone}
                    disabled={busy}
                  />
                )}

                {step === 5 && (
                  <StepReview
                    type={type!}
                    name={name.trim()}
                    city={city.trim()}
                    stages={stages}
                    adminName={adminName.trim()}
                    adminPhone={adminPhone.trim()}
                  />
                )}
              </>
            )}
          </KeyboardAwareScroll>

          {/* ── Footer ─────────────────────────────────────────── */}
          {!createdCode && (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.backBtn, (step === 1 || busy) && styles.backBtnDisabled]}
                onPress={goBack}
                disabled={busy || step === 1}
                accessibilityRole="button"
                accessibilityLabel="السابق"
              >
                <Ionicons
                  name={NEXT_CHEVRON}
                  size={18}
                  color={step === 1 || busy ? Colors.textMuted : Colors.text}
                />
                <Text style={[styles.backBtnText, (step === 1 || busy) && { color: Colors.textMuted }]}>
                  السابق
                </Text>
              </TouchableOpacity>

              <View style={styles.primaryBtnWrap}>
                {step < 5 ? (
                  <PrimaryButton
                    label="التالي"
                    onPress={goNext}
                    icon={BACK_CHEVRON}
                    disabled={busy}
                    fullWidth
                  />
                ) : (
                  <PrimaryButton
                    label="إنشاء المؤسسة"
                    onPress={submit}
                    icon="checkmark-circle"
                    loading={busy}
                    disabled={busy}
                    fullWidth
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SwipeableSheet>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 1 — Type picker
// ─────────────────────────────────────────────────────────────────────────

function StepType({ type, onSelect }: { type: InstType | null; onSelect: (t: InstType) => void }) {
  return (
    <View>
      <Text style={styles.stepHeading}>اختر نوع المؤسسة</Text>
      <Text style={styles.stepSubheading}>هل تنشئ معهداً تعليمياً أم مدرسة؟</Text>
      <View style={styles.typeGrid}>
        <TypeCard
          active={type === 'institute'}
          icon="business"
          title="معهد"
          desc="دروس متخصصة · مواد · مجموعات"
          onPress={() => onSelect('institute')}
        />
        <TypeCard
          active={type === 'school'}
          icon="library"
          title="مدرسة"
          desc="مراحل · صفوف · شعب"
          onPress={() => onSelect('school')}
        />
      </View>
    </View>
  );
}

function TypeCard({
  active, icon, title, desc, onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  desc: string;
  onPress: () => void;
}) {
  if (active) {
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.typeCardWrap}>
        <LinearGradient
          colors={tokens.gradient.brand as readonly [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.typeCardActive}
        >
          <Ionicons name={icon} size={36} color="#fff" />
          <Text style={[styles.typeCardTitle, { color: '#fff' }]}>{title}</Text>
          <Text style={[styles.typeCardDesc, { color: 'rgba(255,255,255,0.88)' }]}>{desc}</Text>
        </LinearGradient>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.typeCardWrap, styles.typeCard]}>
      <Ionicons name={icon} size={36} color={Colors.primary} />
      <Text style={styles.typeCardTitle}>{title}</Text>
      <Text style={styles.typeCardDesc}>{desc}</Text>
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 2 — Basic info
// ─────────────────────────────────────────────────────────────────────────

function StepBasic({
  type, name, city, onChangeName, onChangeCity, disabled,
}: {
  type: InstType;
  name: string;
  city: string;
  onChangeName: (v: string) => void;
  onChangeCity: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View>
      <Text style={styles.stepHeading}>البيانات الأساسية</Text>
      <Text style={styles.stepSubheading}>
        اسم {type === 'school' ? 'المدرسة' : 'المعهد'} ومدينتها
      </Text>

      <Text style={styles.fieldLabel}>الاسم</Text>
      <TextInput
        value={name}
        onChangeText={onChangeName}
        placeholder={type === 'school' ? 'مثال: مدرسة النهضة' : 'مثال: معهد المتميزين'}
        placeholderTextColor={Colors.textMuted}
        style={styles.input}
        editable={!disabled}
      />

      <Text style={styles.fieldLabel}>المدينة</Text>
      <TextInput
        value={city}
        onChangeText={onChangeCity}
        placeholder="مثال: بغداد"
        placeholderTextColor={Colors.textMuted}
        style={styles.input}
        editable={!disabled}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 3 — Stages (schools only) — big cards with checkbox in corner
// ─────────────────────────────────────────────────────────────────────────

function StepStages({
  selected, onToggle, disabled,
}: {
  selected: string[];
  onToggle: (key: string) => void;
  disabled: boolean;
}) {
  return (
    <View>
      <Text style={styles.stepHeading}>ما هي المراحل المتوفرة في هذه المدرسة؟</Text>
      <Text style={styles.stepSubheading}>
        اختر مرحلة واحدة على الأقل — سيتم إنشاء الصفوف والشعب الافتراضية تلقائياً
      </Text>

      <View style={styles.stageList}>
        {STAGE_CATALOGUE.map((s) => {
          const active = selected.includes(s.key);
          return (
            <TouchableOpacity
              key={s.key}
              activeOpacity={0.88}
              onPress={() => onToggle(s.key)}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              accessibilityLabel={s.label}
              style={[styles.stageCard, active && styles.stageCardActive]}
            >
              <View style={[styles.stageIcon, active && styles.stageIconActive]}>
                <Ionicons
                  name={s.icon}
                  size={26}
                  color={active ? '#fff' : Colors.primary}
                />
              </View>

              <View style={styles.stageBody}>
                <Text style={[styles.stageTitle, active && styles.stageTitleActive]}>
                  {s.label}
                </Text>
                <Text style={styles.stageDesc}>{s.desc}</Text>
              </View>

              {/* Corner checkbox — RTL-aware via flex direction */}
              <View style={[styles.stageCheckbox, active && styles.stageCheckboxActive]}>
                {active && <Ionicons name="checkmark" size={16} color="#fff" />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={16} color={Colors.primary} />
        <Text style={styles.infoBannerText}>
          سيُنشأ تلقائياً: مرحلة + صفوفها + شعبة افتراضية (أ) لكل صف. يمكنك تعديل الكل من إعدادات المدرسة.
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 4 — Admin account
// ─────────────────────────────────────────────────────────────────────────

function StepAdmin({
  type, adminName, adminPhone, onChangeName, onChangePhone, disabled,
}: {
  type: InstType;
  adminName: string;
  adminPhone: string;
  onChangeName: (v: string) => void;
  onChangePhone: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <View>
      <Text style={styles.stepHeading}>حساب الإدارة</Text>
      <Text style={styles.stepSubheading}>
        سيُستخدم هذا الحساب لإدارة {type === 'school' ? 'المدرسة' : 'المعهد'}
      </Text>

      <Text style={styles.fieldLabel}>اسم الأدمن</Text>
      <TextInput
        value={adminName}
        onChangeText={onChangeName}
        placeholder="مثال: أحمد محمد"
        placeholderTextColor={Colors.textMuted}
        style={styles.input}
        editable={!disabled}
      />

      <Text style={styles.fieldLabel}>رقم الهاتف (اختياري)</Text>
      <TextInput
        value={adminPhone}
        onChangeText={onChangePhone}
        placeholder="07XXXXXXXXX"
        placeholderTextColor={Colors.textMuted}
        keyboardType="phone-pad"
        style={styles.input}
        editable={!disabled}
      />

      <View style={styles.infoBanner}>
        <Ionicons name="information-circle" size={16} color={Colors.primary} />
        <Text style={styles.infoBannerText}>
          سيُنشَأ رمز دخول للأدمن تلقائياً بعد المراجعة. احفظه للمشاركة معه — لن يظهر مرة أخرى.
        </Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Step 5 — Review
// ─────────────────────────────────────────────────────────────────────────

function StepReview({
  type, name, city, stages, adminName, adminPhone,
}: {
  type: InstType;
  name: string;
  city: string;
  stages: string[];
  adminName: string;
  adminPhone: string;
}) {
  return (
    <View>
      <Text style={styles.stepHeading}>مراجعة وتأكيد</Text>
      <Text style={styles.stepSubheading}>راجع البيانات قبل الإنشاء</Text>

      <View style={styles.reviewCard}>
        <ReviewRow icon="business" label="النوع" value={type === 'school' ? 'مدرسة' : 'معهد'} />
        <ReviewRow icon="pricetag" label="الاسم" value={name} />
        <ReviewRow icon="location" label="المدينة" value={city} />
        {type === 'school' && (
          <ReviewRow
            icon="layers"
            label="المراحل"
            value={
              STAGE_CATALOGUE
                .filter((s) => stages.includes(s.key))
                .map((s) => s.label.replace('المرحلة ', ''))
                .join(' · ')
            }
          />
        )}
        <ReviewRow icon="person" label="أدمن" value={adminName} />
        {adminPhone !== '' && <ReviewRow icon="call" label="الهاتف" value={adminPhone} />}
      </View>

      <View style={[styles.infoBanner, styles.infoBannerSuccess]}>
        <Ionicons name="shield-checkmark" size={16} color={Colors.success} />
        <Text style={styles.infoBannerText}>
          بالضغط "إنشاء"، سيتم إنشاء {type === 'school' ? 'المدرسة' : 'المعهد'} وحساب الأدمن ورمز الدخول
          {type === 'school' ? '، وستُهيَّأ المراحل والصفوف والشعب الافتراضية.' : '.'}
        </Text>
      </View>
    </View>
  );
}

function ReviewRow({ icon, label, value }: {
  icon: keyof typeof Ionicons.glyphMap; label: string; value: string;
}) {
  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewIcon}>
        <Ionicons name={icon} size={14} color={Colors.primary} />
      </View>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Success view
// ─────────────────────────────────────────────────────────────────────────

function SuccessView({
  type, instName, code, onCopy, onDone,
}: {
  type: InstType;
  instName: string;
  code: string;
  onCopy: () => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.successBlock}>
      <View style={styles.successIcon}>
        <Ionicons name="checkmark" size={36} color="#fff" />
      </View>
      <Text style={styles.successTitle}>تم إنشاء {type === 'school' ? 'المدرسة' : 'المعهد'}</Text>
      <Text style={styles.successName}>{instName}</Text>

      <View style={styles.codeBox}>
        <Text style={styles.codeLabel}>رمز دخول الإدارة</Text>
        <Text style={styles.codeValue} selectable>{code}</Text>
        <TouchableOpacity onPress={onCopy} style={styles.copyBtn} accessibilityRole="button">
          <Ionicons name="copy-outline" size={16} color={Colors.primary} />
          <Text style={styles.copyBtnText}>نسخ الرمز</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.successHint}>
        احفظ هذا الرمز وشاركه مع أدمن {type === 'school' ? 'المدرسة' : 'المعهد'}. لن يظهر مرة أخرى.
      </Text>

      {/* Full-width CTA — wrapper adds breathing room so the success button
          doesn't sit flush against the hint text or the sheet bottom edge. */}
      <View style={styles.successDoneBtnWrap}>
        <PrimaryButton
          label="تم — إغلاق"
          onPress={onDone}
          icon="checkmark-circle"
          gradient="success"
          fullWidth
        />
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  kavWrap: { flexShrink: 1 },
  sheetInner: { paddingBottom: tokens.spacing[5] },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[4],
    paddingBottom: tokens.spacing[3],
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  iconBtnSpacer: { width: 40, height: 40 },
  headerTitleWrap: { flex: 1, alignItems: 'center' },
  title: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.black,
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },

  // ── Step indicator (card-based pills)
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing[2],
    paddingHorizontal: tokens.spacing[4],
    paddingBottom: tokens.spacing[3],
  },
  progressPill: {
    height: 5,
    flex: 1,
    maxWidth: 56,
    borderRadius: tokens.radius.pill,
    backgroundColor: Colors.border,
  },
  progressPillPast: { backgroundColor: Colors.primary },
  progressPillCurrent: { backgroundColor: Colors.primary, height: 7 },

  // ── Scroll body
  scroll: { maxHeight: 560 },
  scrollContent: {
    paddingHorizontal: tokens.spacing[5],
    paddingVertical: tokens.spacing[5],
    paddingBottom: tokens.spacing[6],
  },

  // ── Step heading
  stepHeading: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: Colors.text,
    textAlign: 'right',
    lineHeight: 30,
  },
  stepSubheading: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: Colors.textSecondary,
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[5],
    textAlign: 'right',
    lineHeight: 22,
  },

  // ── Type picker
  typeGrid: { flexDirection: 'row', gap: tokens.spacing[3], marginTop: tokens.spacing[2] },
  typeCardWrap: { flex: 1 },
  typeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    padding: tokens.spacing[5],
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    gap: tokens.spacing[2],
  },
  typeCardActive: {
    padding: tokens.spacing[5],
    borderRadius: tokens.radius.xl,
    alignItems: 'center',
    gap: tokens.spacing[2],
    ...tokens.shadow.brand,
  },
  typeCardTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: Colors.text,
    marginTop: tokens.spacing[1],
  },
  typeCardDesc: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // ── Inputs
  fieldLabel: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: Colors.text,
    marginBottom: tokens.spacing[2],
    marginTop: tokens.spacing[4],
    textAlign: 'right',
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[3] + 2,
    fontSize: tokens.font.size.xl,
    color: Colors.text,
    textAlign: 'right',
  },

  // ── Stage cards (big, icon + checkbox in corner)
  stageList: { gap: tokens.spacing[3], marginTop: tokens.spacing[2] },
  stageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    padding: tokens.spacing[4],
    borderRadius: tokens.radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  stageCardActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0D',
    ...tokens.shadow.sm,
  },
  stageIcon: {
    width: 52,
    height: 52,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '14',
  },
  stageIconActive: { backgroundColor: Colors.primary },
  stageBody: { flex: 1 },
  stageTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: Colors.text,
    textAlign: 'right',
  },
  stageTitleActive: { color: Colors.primary },
  stageDesc: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.semi,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'right',
    lineHeight: 18,
  },
  stageCheckbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  stageCheckboxActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  // ── Info banner
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: tokens.spacing[2],
    padding: tokens.spacing[3],
    backgroundColor: Colors.primary + '0D',
    borderRadius: tokens.radius.md,
    marginTop: tokens.spacing[4],
  },
  infoBannerSuccess: { backgroundColor: Colors.success + '14' },
  infoBannerText: {
    flex: 1,
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.bold,
    color: Colors.textSecondary,
    lineHeight: 18,
    textAlign: 'right',
  },

  // ── Review
  reviewCard: {
    backgroundColor: Colors.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[3],
    paddingVertical: tokens.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '88',
  },
  reviewIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary + '15',
  },
  reviewLabel: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: Colors.textMuted,
    minWidth: 70,
  },
  reviewValue: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: Colors.text,
    textAlign: 'left',
  },

  // ── Footer
  footer: {
    flexDirection: 'row',
    gap: tokens.spacing[3],
    paddingHorizontal: tokens.spacing[4],
    paddingTop: tokens.spacing[3],
    alignItems: 'center',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[1] + 2,
    paddingHorizontal: tokens.spacing[4],
    height: 48,
    borderRadius: tokens.radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnDisabled: { opacity: 0.6 },
  backBtnText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: Colors.text,
  },
  primaryBtnWrap: { flex: 1 },

  // ── Success
  successBlock: {
    alignItems: 'center',
    paddingVertical: tokens.spacing[5],
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tokens.spacing[4],
    ...tokens.shadow.success,
  },
  successTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: Colors.text,
    textAlign: 'center',
  },
  successName: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: Colors.textSecondary,
    marginTop: tokens.spacing[1],
    marginBottom: tokens.spacing[5],
    textAlign: 'center',
  },
  codeBox: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.primary + '55',
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing[5],
    alignItems: 'center',
    marginBottom: tokens.spacing[3],
  },
  codeLabel: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: Colors.textMuted,
    marginBottom: tokens.spacing[2],
  },
  codeValue: {
    fontSize: tokens.font.size['4xl'],
    fontWeight: tokens.font.weight.black,
    color: Colors.primary,
    letterSpacing: 3,
    marginBottom: tokens.spacing[3],
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[1] + 2,
    paddingHorizontal: tokens.spacing[4],
    paddingVertical: tokens.spacing[2],
    borderRadius: tokens.radius.sm,
    backgroundColor: Colors.primary + '15',
  },
  copyBtnText: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: Colors.primary,
  },
  successHint: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.bold,
    color: Colors.textMuted,
    textAlign: 'center',
    marginBottom: tokens.spacing[5],
    paddingHorizontal: tokens.spacing[2],
    lineHeight: 18,
  },
  successDoneBtnWrap: {
    width: '100%',
    paddingTop: tokens.spacing[3],
    paddingBottom: tokens.spacing[2],
  },
});

// ─────────────────────────────────────────────────────────────────────────
// NOTE: Did NOT visual-test on device — please verify the wizard flow.
// ─────────────────────────────────────────────────────────────────────────
