import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { copyToClipboard } from '../../utils/clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import ThemeSettings from '../../components/shared/ThemeSettings';
import LanguageSettings from '../../components/shared/LanguageSettings';
import InteractionSettings from '../../components/shared/InteractionSettings';
import NotificationSettings from '../../components/shared/NotificationSettings';
import PrivacyTermsGroup from '../../components/shared/PrivacyTermsGroup';
import SkeletonList from '../../components/shared/SkeletonList';
import { confirmAlert, successAlert } from '../../utils/alerts';
import { searchMatch } from '../../hooks/useSmartSearch';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';

// Phase 2 — extracted settings sections
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens as dtokens } from '../../constants/designTokens';
import InstituteInfoCard from '../../components/institute/settings/InstituteInfoCard';
import WorkingHoursCard from '../../components/institute/settings/WorkingHoursCard';
import StudentsListCard from '../../components/institute/settings/StudentsListCard';
import SettingsLinkCards from '../../components/institute/settings/SettingsLinkCards';
import SettingsSectionHeader from '../../components/institute/settings/SettingsSectionHeader';
import SupportLinksCard from '../../components/institute/settings/SupportLinksCard';
import AboutAppCard from '../../components/institute/settings/AboutAppCard';
import FinancialSheet from '../../components/institute/settings/sheets/FinancialSheet';
import UserCodesSheet from '../../components/institute/settings/sheets/UserCodesSheet';
import MedicalRecordsSheet from '../../components/institute/settings/sheets/MedicalRecordsSheet';

// Search index — each entry maps a section key to a list of keywords. The
// in-screen search filters which sections render. We index by Arabic terms
// only because that's the active locale for institute admins.
type SectionKey =
  | 'establishment'
  | 'management'
  | 'app'
  | 'privacy'
  | 'support'
  | 'about';

const SECTION_KEYWORDS: Record<SectionKey, string[]> = {
  establishment: [
    'المنشأة', 'المعهد', 'المدرسة', 'المؤسسة', 'معلومات', 'اسم',
    'مدينة', 'دوام', 'ساعات', 'بداية', 'نهاية', 'طلاب', 'قائمة',
  ],
  management: [
    'الإدارة', 'سجلات', 'طبية', 'مالية', 'دفع', 'دفعات', 'رموز',
    'كود', 'دخول', 'مستخدمين', 'إعادة',
  ],
  app: [
    'التطبيق', 'ثيم', 'مظهر', 'لون', 'داكن', 'فاتح', 'لغة',
    'صوت', 'اهتزاز', 'إشعارات', 'تنبيهات', 'تفاعل',
  ],
  privacy: ['خصوصية', 'شروط', 'سياسة', 'استخدام'],
  support: ['دعم', 'مساعدة', 'تواصل', 'واتساب', 'بريد', 'إيميل'],
  about: ['حول', 'إصدار', 'نسخة', 'كاي', 'تطبيق'],
};

function sectionMatchesSearch(key: SectionKey, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  // Match on either the canonical keyword list OR fuzzy match against each
  // term — searchMatch normalizes alef/hamza/ya so "اعدادات" also catches
  // "إعدادات".
  return SECTION_KEYWORDS[key].some((kw) => searchMatch(kw, q));
}

export default function InstituteSettings() {
  const { t } = useTranslation();
  const { userInstituteId } = useDataStore();

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Top-level search across settings sections (kept separate from the
  // students-list internal search — different scopes).
  const [settingsSearch, setSettingsSearch] = useState('');

  // Institute info
  const [instituteInfo, setInstituteInfo] = useState<any>(null);

  // Working hours
  const [startHour, setStartHour] = useState('08:00');
  const [endHour, setEndHour] = useState('14:00');

  // Students list
  const [students, setStudents] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Feature 1: Financial Management
  const [showFinancial, setShowFinancial] = useState(false);
  const [studentPayments, setStudentPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [showPaymentInput, setShowPaymentInput] = useState<string | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Feature 2: User Codes Management — codes are write-only from the UI's
  // perspective. Reset generates a new code server-side and surfaces it
  // ONCE in the `revealedCode` modal below; nothing else exposes plaintext.
  const [showUserCodes, setShowUserCodes] = useState(false);
  const [instituteUsers, setInstituteUsers] = useState<any[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [revealedCode, setRevealedCode] = useState<{ userId: string; userName: string; code: string } | null>(null);

  // Feature 4: Medical Records
  const [showMedicalModal, setShowMedicalModal] = useState(false);
  const [medicalSearchQuery, setMedicalSearchQuery] = useState('');
  const [medicalSearchResults, setMedicalSearchResults] = useState<any[]>([]);
  const [selectedStudentMedical, setSelectedStudentMedical] = useState<any>(null);
  const [loadingMedical, setLoadingMedical] = useState(false);
  const [medicalRecord, setMedicalRecord] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (!userInstituteId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [info, studs, savedHours] = await Promise.all([
        api.getInstituteInfo(userInstituteId),
        api.getStudentsByInstitute(userInstituteId),
        AsyncStorage.getItem(`working_hours_${userInstituteId}`),
      ]);
      setInstituteInfo(info);
      setStudents(studs);
      if (savedHours) {
        try {
          const parsed = JSON.parse(savedHours);
          if (parsed.start) setStartHour(parsed.start);
          if (parsed.end) setEndHour(parsed.end);
        } catch (err) { console.error(err); }
      }
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => {
    loadData();
  }, [userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  // Feature 1: Load financial data
  const loadFinancialData = useCallback(async () => {
    if (!userInstituteId) return;
    setLoadingPayments(true);
    try {
      const data = await api.getStudentPaymentsSummary(userInstituteId);
      setStudentPayments(data);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تحميل البيانات المالية');
    } finally {
      setLoadingPayments(false);
    }
  }, [userInstituteId]);

  const handleMakePayment = async (studentId: string) => {
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('خطأ', 'يرجى إدخال مبلغ صحيح');
      return;
    }
    setProcessingPayment(true);
    try {
      await api.makeStudentPayment(studentId, userInstituteId || '', amount);
      Alert.alert('تم', 'تم تسجيل الدفعة بنجاح');
      setPaymentAmount('');
      setShowPaymentInput(null);
      loadFinancialData();
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تسجيل الدفعة');
    } finally {
      setProcessingPayment(false);
    }
  };

  // Feature 2: Load user codes
  const loadUserCodes = useCallback(async () => {
    if (!userInstituteId) return;
    setLoadingUsers(true);
    try {
      const data = await api.getInstituteUsersWithCodes(userInstituteId);
      setInstituteUsers(data);
    } catch (err: any) {
      Alert.alert('خطأ', err.message || 'فشل تحميل بيانات المستخدمين');
    } finally {
      setLoadingUsers(false);
    }
  }, [userInstituteId]);

  const handleResetUserCode = async (userId2: string) => {
    const target = instituteUsers.find((u) => u.id === userId2);
    const userName = target?.name || 'المستخدم';
    const proceed = await new Promise<boolean>((resolve) => {
      Alert.alert(
        'إعادة إنشاء الكود',
        `سيُلغى الكود الحالي لـ ${userName} ويُنشأ كود جديد. هذي العملية لا يمكن التراجع عنها.`,
        [
          { text: 'إلغاء', style: 'cancel', onPress: () => resolve(false) },
          { text: 'متابعة', style: 'destructive', onPress: () => resolve(true) },
        ],
      );
    });
    if (!proceed) return;
    setResettingUserId(userId2);
    try {
      const newCode = await api.regenerateUserLoginCode(userId2);
      setRevealedCode({ userId: userId2, userName, code: newCode });
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل إعادة إنشاء الكود');
    } finally {
      setResettingUserId(null);
    }
  };

  const handleCopyRevealed = async () => {
    if (!revealedCode) return;
    const ok = await copyToClipboard(revealedCode.code);
    if (ok) successAlert('تم النسخ', 'تم نسخ الكود الجديد إلى الحافظة');
  };

  // Feature 4: Medical records
  const handleMedicalSearch = async (query: string) => {
    setMedicalSearchQuery(query);
    if (query.trim().length < 2 || !userInstituteId) {
      setMedicalSearchResults([]);
      return;
    }
    try {
      const results = await api.searchStudents(query.trim(), userInstituteId);
      setMedicalSearchResults(results);
    } catch (err) { console.error(err); }
  };

  const handleSelectStudentMedical = async (student: any) => {
    setSelectedStudentMedical(student);
    setLoadingMedical(true);
    try {
      if (!userInstituteId) throw new Error('معرف المؤسسة مفقود');
      const record = await api.getMedicalRecord(student.id, userInstituteId);
      setMedicalRecord(record);
    } catch (err) { console.error(err); } finally {
      setLoadingMedical(false);
    }
  };

  const filteredStudents = students.filter((s) =>
    searchMatch(s.full_name, searchQuery) || searchMatch(s.code, searchQuery)
  );

  const handleSaveWorkingHours = async () => {
    try {
      await AsyncStorage.setItem(
        `working_hours_${userInstituteId}`,
        JSON.stringify({ start: startHour, end: endHour })
      );
      Alert.alert(t('common.success'), t('institute.hoursSaved'));
    } catch {
      Alert.alert(t('common.error'), t('institute.hoursFailed'));
    }
  };

  // Suppress unused-imports warnings — these are kept for parity with the
  // pre-refactor file (confirmAlert was imported previously alongside successAlert).
  void confirmAlert;

  // Visibility map — recomputed per render, dirt-cheap.
  const visibility = useMemo(() => ({
    establishment: sectionMatchesSearch('establishment', settingsSearch),
    management: sectionMatchesSearch('management', settingsSearch),
    app: sectionMatchesSearch('app', settingsSearch),
    privacy: sectionMatchesSearch('privacy', settingsSearch),
    support: sectionMatchesSearch('support', settingsSearch),
    about: sectionMatchesSearch('about', settingsSearch),
  }), [settingsSearch]);

  const anyVisible = useMemo(
    () => Object.values(visibility).some(Boolean),
    [visibility]
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('common.settings')}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        showBack={false}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          contentContainerStyle={{ paddingBottom: 40 }}
        >
          {/* Top search — filters which sections are shown below */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={dtokens.color.text3} />
            <TextInput
              value={settingsSearch}
              onChangeText={setSettingsSearch}
              placeholder="ابحث في الإعدادات..."
              placeholderTextColor={dtokens.color.text3}
              style={styles.searchInput}
              textAlign="right"
            />
            {settingsSearch.length > 0 ? (
              <TouchableOpacity onPress={() => setSettingsSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={dtokens.color.text3} />
              </TouchableOpacity>
            ) : null}
          </View>

          {loading ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
              <SkeletonList count={4} cardHeight={88} />
            </View>
          ) : !anyVisible ? (
            // No section matches the user's search → empty hint, not a crash
            <View style={styles.noResultsBox}>
              <Ionicons name="search-outline" size={48} color={dtokens.color.text3} />
              <Text style={styles.noResultsTitle}>لا توجد نتائج</Text>
              <Text style={styles.noResultsMsg}>
                لم نجد إعدادات تطابق "{settingsSearch.trim()}"
              </Text>
            </View>
          ) : (
            <>
              {visibility.establishment && (
                <>
                  <SettingsSectionHeader title="المنشأة" icon="business" />
                  <View style={styles.sectionBody}>
                    <InstituteInfoCard
                      instituteInfo={instituteInfo}
                      titleLabel={t('institute.instituteInfo')}
                      nameLabel={t('common.name')}
                      cityLabel={t('institute.city')}
                      unspecifiedLabel={t('common.unspecified')}
                    />

                    <WorkingHoursCard
                      startHour={startHour}
                      endHour={endHour}
                      onChangeStart={setStartHour}
                      onChangeEnd={setEndHour}
                      onSave={handleSaveWorkingHours}
                      titleLabel={t('institute.workingHours')}
                      startLabel={t('institute.startTime')}
                      endLabel={t('institute.endTime')}
                      saveLabel={t('common.save')}
                    />

                    <StudentsListCard
                      students={students}
                      filteredStudents={filteredStudents}
                      searchQuery={searchQuery}
                      onChangeSearch={setSearchQuery}
                      titleLabel={t('institute.studentList')}
                      searchPlaceholder={t('institute.searchStudent')}
                      emptyLabel={t('institute.noStudents')}
                      studentRoleLabel={t('roles.student')}
                    />
                  </View>
                </>
              )}

              {visibility.management && (
                <>
                  <SettingsSectionHeader title="الإدارة" icon="briefcase" />
                  <View style={styles.sectionBody}>
                    <SettingsLinkCards
                      onPressMedical={() => { setShowMedicalModal(true); setSelectedStudentMedical(null); setMedicalRecord(null); setMedicalSearchQuery(''); setMedicalSearchResults([]); }}
                      onPressFinancial={() => { setShowFinancial(true); loadFinancialData(); }}
                      onPressUserCodes={() => { setShowUserCodes(true); loadUserCodes(); }}
                      medicalTitle={t('institute.medicalRecords')}
                      medicalDesc={t('institute.medicalRecordsDesc')}
                      financialTitle={t('institute.financial')}
                      financialDesc={t('institute.financialDesc')}
                      userCodesTitle={t('institute.userCodes')}
                      userCodesDesc={t('institute.userCodesDesc')}
                    />
                  </View>
                </>
              )}

              {visibility.app && (
                <>
                  <SettingsSectionHeader title="التطبيق" icon="phone-portrait" />
                  <ThemeSettings />
                  <LanguageSettings />
                  <InteractionSettings />
                  {userInstituteId && <NotificationSettings instituteId={userInstituteId} />}
                </>
              )}

              {/* PrivacyTermsGroup carries its own internal "الخصوصية" heading
                  matching the visual style of ThemeSettings/LanguageSettings,
                  so we skip the SettingsSectionHeader here to avoid double
                  titling. */}
              {visibility.privacy && <PrivacyTermsGroup />}

              {visibility.support && (
                <>
                  <SettingsSectionHeader title="الدعم والمساعدة" icon="help-buoy" />
                  <SupportLinksCard />
                </>
              )}

              {visibility.about && (
                <>
                  <SettingsSectionHeader title="حول التطبيق" icon="information-circle" />
                  <AboutAppCard />
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <FinancialSheet
        visible={showFinancial}
        onClose={() => setShowFinancial(false)}
        loadingPayments={loadingPayments}
        studentPayments={studentPayments}
        showPaymentInput={showPaymentInput}
        paymentAmount={paymentAmount}
        processingPayment={processingPayment}
        onTogglePaymentInput={(id) => {
          if (showPaymentInput === id) {
            setShowPaymentInput(null);
          } else {
            setShowPaymentInput(id);
            setPaymentAmount('');
          }
        }}
        onChangePaymentAmount={setPaymentAmount}
        onMakePayment={handleMakePayment}
        title={t('institute.financial')}
      />

      <UserCodesSheet
        visible={showUserCodes}
        onClose={() => setShowUserCodes(false)}
        loadingUsers={loadingUsers}
        instituteUsers={instituteUsers}
        resettingUserId={resettingUserId}
        onResetCode={handleResetUserCode}
        title={t('institute.userCodes')}
      />

      <Modal
        visible={!!revealedCode}
        transparent
        animationType="fade"
        onRequestClose={() => setRevealedCode(null)}
      >
        <Pressable
          style={revealStyles.backdrop}
          onPress={() => setRevealedCode(null)}
        >
          <Pressable style={revealStyles.card} onPress={() => {}}>
            <View style={revealStyles.iconWrap}>
              <Ionicons name="shield-checkmark" size={32} color={Colors.primary} />
            </View>
            <Text style={revealStyles.title}>تم إنشاء الكود الجديد</Text>
            <Text style={revealStyles.subtitle}>
              {revealedCode?.userName}
            </Text>
            <Text style={revealStyles.warning}>
              هذا الكود يظهر مرة واحدة فقط. انسخه الآن وسلّمه للمستخدم — لا يمكن استرجاعه لاحقاً.
            </Text>
            <View style={revealStyles.codeBox}>
              <Text selectable style={revealStyles.codeText}>{revealedCode?.code}</Text>
            </View>
            <TouchableOpacity style={revealStyles.copyBtn} onPress={handleCopyRevealed}>
              <Ionicons name="copy-outline" size={16} color="#fff" />
              <Text style={revealStyles.copyBtnText}>نسخ الكود</Text>
            </TouchableOpacity>
            <TouchableOpacity style={revealStyles.doneBtn} onPress={() => setRevealedCode(null)}>
              <Text style={revealStyles.doneBtnText}>تم — أغلق</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <MedicalRecordsSheet
        visible={showMedicalModal}
        onClose={() => setShowMedicalModal(false)}
        selectedStudentMedical={selectedStudentMedical}
        medicalSearchQuery={medicalSearchQuery}
        medicalSearchResults={medicalSearchResults}
        loadingMedical={loadingMedical}
        medicalRecord={medicalRecord}
        onSearch={handleMedicalSearch}
        onSelectStudent={handleSelectStudentMedical}
        onClearSelection={() => { setSelectedStudentMedical(null); setMedicalRecord(null); }}
        title={t('institute.medicalRecords')}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: dtokens.color.surface,
    borderRadius: dtokens.radius.md,
    borderWidth: 1,
    borderColor: dtokens.color.border,
    ...dtokens.shadow.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: dtokens.font.size.lg,
    color: dtokens.color.text,
    paddingVertical: 0,
  },
  sectionBody: {
    paddingHorizontal: 16,
  },
  noResultsBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  noResultsTitle: {
    fontSize: dtokens.font.size.xl,
    fontWeight: dtokens.font.weight.bold,
    color: dtokens.color.text,
  },
  noResultsMsg: {
    fontSize: dtokens.font.size.lg,
    color: dtokens.color.text3,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
});

const revealStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  warning: {
    fontSize: 12,
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 10,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 4,
  },
  codeBox: {
    width: '100%',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  codeText: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  copyBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
  },
  copyBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 10,
    alignItems: 'center',
  },
  doneBtnText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
