// Medical record edit form — orchestration only.
// Data flow:
//   useMedicalStore.selectedStudent → loadMedicalRecord → medicalRecord (Supabase via api)
//   saveMedicalRecord(studentId, instituteId, payload) keeps tenant isolation.
//   sendAlert requires userInstituteId — guarded; do NOT remove that check.
//   Feature gate: useFeatureFlag('medical_records'). When off → <LockedScreen />.
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useMedicalStore from '../../stores/medicalStore';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { tokens } from '../../constants/designTokens';
import { HEALTH_FIELDS } from '../../constants/medical';
import { haptics } from '../../utils/haptics';

import RoleInnerHero from '../../components/shared/RoleInnerHero';
import LockedScreen from '../../components/medical/shared/LockedScreen';
import SelectedStudentCard from '../../components/medical/records/SelectedStudentCard';
import HealthFieldCard from '../../components/medical/records/HealthFieldCard';
import BloodTypeDropdown from '../../components/medical/records/BloodTypeDropdown';
import AlertSection from '../../components/medical/records/AlertSection';
import BloodTypePickerSheet from '../../components/medical/records/sheets/BloodTypePickerSheet';
import AlertParentSheet from '../../components/medical/records/sheets/AlertParentSheet';

// Resolve a HEALTH_FIELDS entry (icon + colors) by key once at module load.
const FIELD_MAP = HEALTH_FIELDS.reduce<Record<string, (typeof HEALTH_FIELDS)[number]>>(
  (acc, f) => {
    acc[f.key] = f;
    return acc;
  },
  {},
);

export default function MedicalRecords() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const {
    selectedStudent,
    medicalRecord,
    isLoading,
    loadMedicalRecord,
    saveMedicalRecord,
    sendAlert,
  } = useMedicalStore();
  const isEnabled = useFeatureFlag('medical_records');

  const [bloodType, setBloodType] = useState('');
  const [bloodPressure, setBloodPressure] = useState('');
  const [sugarLevel, setSugarLevel] = useState('');
  const [eyes, setEyes] = useState('');
  const [dental, setDental] = useState('');
  const [allergies, setAllergies] = useState('');
  const [chronicConditions, setChronicConditions] = useState('');
  const [saving, setSaving] = useState(false);
  const [alertModalVisible, setAlertModalVisible] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [alertSending, setAlertSending] = useState(false);
  const [bloodTypePickerVisible, setBloodTypePickerVisible] = useState(false);

  useEffect(() => {
    if (selectedStudent && userInstituteId) {
      loadMedicalRecord(selectedStudent.id, userInstituteId);
    }
  }, [selectedStudent?.id, userInstituteId]);

  useEffect(() => {
    if (medicalRecord) {
      setBloodType(medicalRecord.blood_type || '');
      setBloodPressure(medicalRecord.blood_pressure || '');
      setSugarLevel(medicalRecord.sugar_level || '');
      setEyes(medicalRecord.eyes || '');
      setDental(medicalRecord.dental || '');
      setAllergies(medicalRecord.allergies || '');
      setChronicConditions(medicalRecord.chronic_conditions || '');
    } else {
      setBloodType('');
      setBloodPressure('');
      setSugarLevel('');
      setEyes('');
      setDental('');
      setAllergies('');
      setChronicConditions('');
    }
  }, [medicalRecord]);

  const handleSave = async () => {
    if (!selectedStudent || !userInstituteId) return;
    // Require at least one field so empty records don't inflate the "withRecords" coverage stat.
    const hasAnyField = [
      bloodType,
      bloodPressure,
      sugarLevel,
      eyes,
      dental,
      allergies,
      chronicConditions,
    ].some((v) => v && String(v).trim().length > 0);
    if (!hasAnyField) {
      Alert.alert(
        t('common.warning', { defaultValue: 'تنبيه' }),
        t('medical.fillAtLeastOneField', {
          defaultValue: 'املأ حقلاً واحداً على الأقل قبل الحفظ',
        }),
      );
      return;
    }
    setSaving(true);
    try {
      await saveMedicalRecord(selectedStudent.id, userInstituteId, {
        blood_type: bloodType,
        blood_pressure: bloodPressure,
        sugar_level: sugarLevel,
        eyes,
        dental,
        allergies,
        chronic_conditions: chronicConditions,
      });
      haptics.success();
      Alert.alert(t('common.success'), t('medical.recordSaved'));
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('medical.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSendAlert = async () => {
    if (!alertMessage.trim()) {
      Alert.alert(t('common.error'), t('medical.writeAlertMessage'));
      return;
    }
    if (!selectedStudent || !userId) return;
    if (!userInstituteId) {
      Alert.alert(t('common.error'), 'المؤسسة غير محددة — يرجى إعادة تسجيل الدخول');
      return;
    }
    setAlertSending(true);
    try {
      await sendAlert(
        selectedStudent.id,
        selectedStudent.full_name,
        alertMessage.trim(),
        userId,
        userInstituteId,
      );
      haptics.success();
      Alert.alert(t('common.success'), t('medical.parentAlertSent'));
      setAlertModalVisible(false);
      setAlertMessage('');
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('medical.alertFailed'));
    } finally {
      setAlertSending(false);
    }
  };

  if (!isEnabled) return <LockedScreen />;

  if (!selectedStudent) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={t('medical.records')}
          gradient={tokens.gradient.medical}
          glowAccent="rgba(239,68,68,0.30)"
          showBack={false}
        />
        <View style={styles.emptyContainer}>
          <Ionicons name="search" size={48} color={tokens.color.text3} />
          <Text style={styles.emptyTitle}>{t('medical.searchFirstTitle')}</Text>
          <Text style={styles.emptyDesc}>{t('medical.searchFirstDesc')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pressureField = FIELD_MAP.blood_pressure;
  const sugarField = FIELD_MAP.sugar_level;
  const eyeField = FIELD_MAP.eyes;
  const dentalField = FIELD_MAP.dental;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('medical.records')}
        gradient={tokens.gradient.medical}
        glowAccent="rgba(239,68,68,0.30)"
        showBack={false}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.contentArea}>
            <SelectedStudentCard
              fullName={selectedStudent.full_name}
              bloodType={bloodType}
            />

            {isLoading ? (
              <ActivityIndicator
                size="large"
                color={tokens.color.m600}
                style={styles.loader}
              />
            ) : (
              <>
                {/* Row 1: blood pressure (right) + blood type dropdown (left) */}
                <View style={styles.fieldRow}>
                  <View style={styles.cardHalf}>
                    <HealthFieldCard
                      label={t('medical.bloodPressure')}
                      iconName={pressureField.icon as any}
                      iconColor={pressureField.color}
                      iconBg={pressureField.bg}
                      value={bloodPressure}
                      onChangeText={setBloodPressure}
                      placeholder="120/80"
                    />
                  </View>
                  <View style={styles.cardHalf}>
                    <BloodTypeDropdown
                      label={t('institute.bloodType')}
                      value={bloodType}
                      onPress={() => setBloodTypePickerVisible(true)}
                    />
                  </View>
                </View>

                {/* Row 2: eye health (right) + sugar level (left) */}
                <View style={styles.fieldRow}>
                  <View style={styles.cardHalf}>
                    <HealthFieldCard
                      label={t('medical.eyeHealth')}
                      iconName={eyeField.icon as any}
                      iconColor={eyeField.color}
                      iconBg={eyeField.bg}
                      value={eyes}
                      onChangeText={setEyes}
                      placeholder={t('medical.healthyPlaceholder')}
                    />
                  </View>
                  <View style={styles.cardHalf}>
                    <HealthFieldCard
                      label={t('medical.sugarLevel')}
                      iconName={sugarField.icon as any}
                      iconColor={sugarField.color}
                      iconBg={sugarField.bg}
                      value={sugarLevel}
                      onChangeText={setSugarLevel}
                      placeholder={t('medical.normalPlaceholder')}
                    />
                  </View>
                </View>

                {/* Row 3: dental (full width) */}
                <View style={styles.fieldFull}>
                  <HealthFieldCard
                    label={t('medical.dentalHealth')}
                    iconName={dentalField.icon as any}
                    iconColor={dentalField.color}
                    iconBg={dentalField.bg}
                    value={dental}
                    onChangeText={setDental}
                    placeholder={t('medical.healthStatus')}
                  />
                </View>

                <AlertSection
                  allergies={allergies}
                  setAllergies={setAllergies}
                  chronicConditions={chronicConditions}
                  setChronicConditions={setChronicConditions}
                />

                {/* Save button — red gradient */}
                <TouchableOpacity
                  style={styles.saveBtnWrap}
                  onPress={handleSave}
                  disabled={saving}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={t('medical.saveRecord')}
                >
                  <LinearGradient
                    colors={tokens.gradient.medicalCta}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.saveBtn, saving && styles.btnDisabled]}
                  >
                    {saving ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle" size={18} color="#fff" />
                        <Text style={styles.saveBtnText}>{t('medical.saveRecord')}</Text>
                      </>
                    )}
                  </LinearGradient>
                </TouchableOpacity>

                {/* Alert parent button — outline */}
                <TouchableOpacity
                  style={styles.alertBtn}
                  onPress={() => setAlertModalVisible(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('medical.alertParent')}
                >
                  <Ionicons name="notifications" size={18} color={tokens.color.m600} />
                  <Text style={styles.alertBtnText}>{t('medical.alertParent')}</Text>
                </TouchableOpacity>
              </>
            )}

            <View style={styles.bottomSpacer} />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <BloodTypePickerSheet
        visible={bloodTypePickerVisible}
        onClose={() => setBloodTypePickerVisible(false)}
        selected={bloodType}
        onSelect={setBloodType}
      />

      <AlertParentSheet
        visible={alertModalVisible}
        onClose={() => setAlertModalVisible(false)}
        studentName={selectedStudent.full_name}
        message={alertMessage}
        onChangeMessage={setAlertMessage}
        onSend={handleSendAlert}
        sending={alertSending}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle: {
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.black,
    color: tokens.color.text,
    textAlign: 'right',
  },
  contentArea: { paddingHorizontal: tokens.spacing[4], paddingTop: 8 },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontSize: tokens.font.size['2xl'] - 1,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  emptyDesc: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  loader: { marginTop: 40 },
  fieldRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  cardHalf: { flex: 1 },
  fieldFull: { marginBottom: 10 },
  saveBtnWrap: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    marginBottom: 10,
    ...tokens.shadow.medical,
  },
  saveBtn: {
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: tokens.radius.md,
  },
  btnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontSize: tokens.font.size.xl - 1,
    fontWeight: tokens.font.weight.heavy,
  },
  alertBtn: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: tokens.color.m100,
  },
  alertBtnText: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.m600,
  },
  bottomSpacer: { height: 30 },
});
