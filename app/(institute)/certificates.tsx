import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { REPORT_THEMES } from '../../services/gradeReportTemplates';
import { exportGradeReportCertPDF } from '../../services/pdfExport';
import { FLATLIST_PERF, hapticSuccess } from '../../utils/performance';
import { confirmAlert } from '../../utils/alerts';
import * as ImagePicker from 'expo-image-picker';
import { bunnyStorage } from '../../services/bunny';
import { compressStamp } from '../../utils/imageCompression';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';

export default function InstituteCertificates() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId, institutes, isFetching, detectInstitute } = useDataStore();

  const CERT_TYPES = [
    { key: 'excellence', label: t('institute.certExcellence'), icon: 'star', color: '#059669' },
    { key: 'completion', label: t('institute.certCompletion'), icon: 'checkmark-circle', color: '#0891B2' },
    { key: 'participation', label: t('institute.certParticipation'), icon: 'people', color: '#7C3AED' },
    { key: 'appreciation', label: t('institute.certAppreciation'), icon: 'heart', color: '#EC4899' },
    { key: 'behavior', label: t('institute.certBehavior'), icon: 'shield-checkmark', color: '#10B981' },
    { key: 'attendance', label: t('institute.certAttendance'), icon: 'calendar', color: '#F59E0B' },
    { key: 'graduation', label: t('institute.certGraduation'), icon: 'school', color: '#DC2626' },
    { key: 'grades', label: t('institute.certGradeReport'), icon: 'stats-chart', color: '#4F46E5' },
    { key: 'single_subject', label: t('institute.certSingleSubject'), icon: 'document-text', color: '#B45309' },
  ];
  const instName = institutes.find(i => i.id === userInstituteId)?.name || '';
  const isEnabled = useFeatureFlag('certificates');

  const [certificates, setCertificates] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Issue modal
  const [showIssue, setShowIssue] = useState(false);
  const [issueMode, setIssueMode] = useState<'single' | 'bulk'>('single');
  const [issueType, setIssueType] = useState('excellence');
  const [issueTheme, setIssueTheme] = useState('royal_gold');
  const [issueTitle, setIssueTitle] = useState('');
  const [issueDesc, setIssueDesc] = useState('');
  const [showEmoji, setShowEmoji] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([]);
  const [includeGrades, setIncludeGrades] = useState(false);
  const [issuing, setIssuing] = useState(false);

  // Grade preview
  const [previewGrades, setPreviewGrades] = useState<any[]>([]);
  const [editingGrades, setEditingGrades] = useState<Record<number, { score: string; maxScore: string }>>({});

  // Stamp & Signature
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [uploadingSig, setUploadingSig] = useState(false);

  const loadData = async () => {
    if (!userInstituteId) return;
    try {
      const [certs, studs, cls, cats, stamps] = await Promise.all([
        api.getInstituteCertificates(userInstituteId),
        api.getStudentsByInstitute(userInstituteId),
        api.getClassesByInstitute(userInstituteId),
        api.getGradeCategories(userInstituteId),
        api.getInstituteStamp(userInstituteId),
      ]);
      setCertificates(certs);
      setStudents(studs);
      setClasses(cls);
      setCategories(cats);
      setStampUrl(stamps.stampUrl);
      setSignatureUrl(stamps.signatureUrl);
    } catch (err) { console.error(err); } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [userInstituteId]);
  const onRefresh = useCallback(async () => { haptics.light(); setRefreshing(true); try { await loadData(); } finally { setRefreshing(false); } }, [userInstituteId]);

  // Load grades when student + categories selected.
  // resetEdits=true wipes editingGrades (use when student changes), false preserves (use when toggling categories)
  const loadGradePreview = async (resetEdits: boolean) => {
    if (!selectedStudentId || !userInstituteId || selectedCatIds.length === 0) { setPreviewGrades([]); return; }
    try {
      const grades = await api.getStudentGradesForCertificate(selectedStudentId, userInstituteId, selectedCatIds);
      setPreviewGrades(grades);
      if (resetEdits) setEditingGrades({});
    } catch { setPreviewGrades([]); }
  };

  // Student change → reset unsaved edits
  useEffect(() => {
    if (includeGrades && issueMode === 'single') loadGradePreview(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudentId]);

  // Category/includeGrades toggle → refresh preview but preserve in-progress edits
  useEffect(() => {
    if (includeGrades && issueMode === 'single') loadGradePreview(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCatIds, includeGrades]);

  const handleIssue = async () => {
    if (!userInstituteId || !userId) return;

    // Validation
    const type = issueType as any;
    const isGradeType = type === 'grades' || type === 'single_subject';

    if (issueMode === 'single' && !selectedStudentId) { Alert.alert(t('common.error'), t('institute.selectStudent')); return; }
    if (issueMode === 'bulk' && !selectedClassId) { Alert.alert(t('common.error'), t('institute.selectClass')); return; }

    setIssuing(true);
    try {
      const title = issueTitle.trim() || CERT_TYPES.find(ct => ct.key === issueType)?.label || t('institute.certificates');

      // Build grades from edited preview
      let finalGrades = previewGrades;
      if (Object.keys(editingGrades).length > 0) {
        finalGrades = previewGrades.map((g, i) => {
          const edit = editingGrades[i];
          if (edit) return { ...g, score: Number(edit.score) || g.score, maxScore: Number(edit.maxScore) || g.maxScore };
          return g;
        });
      }

      if (issueMode === 'single') {
        // Single student
        const extraData: any = { themeId: issueTheme, showEmoji, type };
        if (isGradeType || includeGrades) extraData.grades = finalGrades;

        await api.issueCertificate({
          instituteId: userInstituteId, studentId: selectedStudentId,
          title, type, description: issueDesc.trim() || undefined,
          templateId: issueTheme, issuedBy: userId, extraData,
        });

        hapticSuccess();
        Alert.alert(t('common.success'), t('institute.certIssued'));
      } else {
        // Bulk — all students in class (scoped to institute for isolation)
        const classStudents = await api.getStudentsByClass(selectedClassId, userInstituteId || undefined);
        const studentIds = classStudents.map((s: any) => s.id);

        if (studentIds.length === 0) { Alert.alert(t('common.warning'), t('institute.noStudentsInClass')); setIssuing(false); return; }

        const result = await api.issueBulkCertificates({
          instituteId: userInstituteId, studentIds, title, type,
          description: issueDesc.trim() || undefined,
          templateId: issueTheme, themeId: issueTheme, issuedBy: userId,
          includeGrades: isGradeType || includeGrades,
          categoryIds: selectedCatIds.length > 0 ? selectedCatIds : undefined,
        });

        hapticSuccess();
        Alert.alert(t('common.success'), `${result.issued} ${t('institute.certificates')}`);
      }

      setShowIssue(false);
      loadData();
    } catch (err: any) { Alert.alert(t('common.error'), err.message || t('institute.certIssueFailed')); } finally {
      setIssuing(false);
    }
  };

  const handleUploadStamp = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingStamp(true);
      const compressed = await compressStamp(result.assets[0].uri);
      const url = await bunnyStorage.uploadImage(compressed, `stamps/${userInstituteId}`);
      await api.saveInstituteStamp(userInstituteId || '', url, undefined);
      setStampUrl(url);
      Alert.alert(t('common.success'), t('institute.stampUploaded'));
    } catch (err: any) { Alert.alert(t('common.error'), err.message || t('institute.stampFailed')); } finally {
      setUploadingStamp(false);
    }
  };

  const handleUploadSignature = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (result.canceled || !result.assets?.[0]) return;
      setUploadingSig(true);
      const compressed = await compressStamp(result.assets[0].uri);
      const url = await bunnyStorage.uploadImage(compressed, `signatures/${userInstituteId}`);
      await api.saveInstituteStamp(userInstituteId || '', undefined, url);
      setSignatureUrl(url);
      Alert.alert(t('common.success'), t('institute.signatureUploaded'));
    } catch (err: any) { Alert.alert(t('common.error'), err.message || t('institute.signatureFailed')); } finally {
      setUploadingSig(false);
    }
  };

  const handlePreviewPDF = async () => {
    try {
      const studentName = issueMode === 'single'
        ? (students.find(s => s.id === selectedStudentId)?.full_name || t('roles.student'))
        : t('roles.student');
      let finalGrades = previewGrades;
      if (Object.keys(editingGrades).length > 0) {
        finalGrades = previewGrades.map((g, i) => {
          const edit = editingGrades[i];
          if (edit) return { ...g, score: Number(edit.score) || g.score, maxScore: Number(edit.maxScore) || g.maxScore };
          return g;
        });
      }
      await exportGradeReportCertPDF({
        studentName, instituteName: instName,
        title: issueTitle.trim() || CERT_TYPES.find(ct => ct.key === issueType)?.label || t('institute.certificates'),
        description: issueDesc.trim() || undefined,
        grades: (issueType === 'grades' || issueType === 'single_subject' || includeGrades) ? finalGrades : undefined,
        issuedAt: new Date().toISOString(),
        type: issueType as any,
        themeId: issueTheme,
        showEmoji, stampUrl, signatureUrl,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('institute.previewFailed'));
    }
  };

  const handleExportPDF = async (cert: any) => {
    try {
      const studentName = cert.users?.full_name || t('roles.student');
      const extraData = cert.data || {};
      await exportGradeReportCertPDF({
        studentName, instituteName: instName,
        title: cert.title, description: cert.description,
        grades: extraData.grades, issuedAt: cert.issued_at,
        type: extraData.type || cert.type || 'excellence',
        themeId: extraData.themeId || 'royal_gold',
        stampUrl, signatureUrl,
        showEmoji: extraData.showEmoji,
      });
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('institute.certExportFailed'));
    }
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

  if (!isEnabled) {
    return <SafeAreaView style={s.container}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="lock-closed" size={48} color="#E2E8F0" /><Text style={{ fontSize: 16, color: Colors.textMuted, marginTop: 12 }}>{t('institute.certificatesDisabled')}</Text></View></SafeAreaView>;
  }

  if (loading) {
    return <SafeAreaView style={s.container}><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={Colors.primary} /></View></SafeAreaView>;
  }

  const isGradeType = issueType === 'grades' || issueType === 'single_subject';

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الشهادات"
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
        right={
          <TouchableOpacity style={s.issueBtn} onPress={() => setShowIssue(true)} accessibilityLabel={t('institute.issueCertificate')}>
            <Ionicons name="add-circle" size={18} color="#fff" />
            <Text style={s.issueBtnText}>{t('institute.issueCertificate')}</Text>
          </TouchableOpacity>
        }
      />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />} contentContainerStyle={{ paddingBottom: 30, paddingTop: 12 }}>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={[s.stat, { backgroundColor: '#EEF2FF' }]}>
            <Text style={[s.statVal, { color: '#4F46E5' }]}>{certificates.length}</Text>
            <Text style={s.statLabel}>{t('institute.total')}</Text>
          </View>
          <View style={[s.stat, { backgroundColor: '#ECFDF5' }]}>
            <Text style={[s.statVal, { color: '#059669' }]}>{certificates.filter(c => !c.is_revoked).length}</Text>
            <Text style={s.statLabel}>{t('common.active')}</Text>
          </View>
          <View style={[s.stat, { backgroundColor: '#FEE2E2' }]}>
            <Text style={[s.statVal, { color: '#DC2626' }]}>{certificates.filter(c => c.is_revoked).length}</Text>
            <Text style={s.statLabel}>{t('institute.revoked')}</Text>
          </View>
        </View>

        {/* Certificates List */}
        {certificates.length === 0 ? (
          <Text style={s.empty}>{t('institute.noCertificates')}</Text>
        ) : certificates.map(cert => (
          <View key={cert.id} style={[s.certCard, cert.is_revoked && { opacity: 0.4 }]}>
            <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
              <Text style={s.certTitle}>{cert.title}</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>{cert.users?.full_name || t('roles.student')}</Text>
              <Text style={{ fontSize: 10, color: Colors.textMuted }}>{new Date(cert.issued_at).toLocaleDateString('ar-IQ')}</Text>
            </View>
            <View style={{ gap: 6, alignItems: 'center' }}>
              <TouchableOpacity style={s.pdfBtn} onPress={() => handleExportPDF(cert)}>
                <Ionicons name="download" size={16} color={Colors.primary} />
                <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.primary }}>PDF</Text>
              </TouchableOpacity>
              {!cert.is_revoked && (
                <TouchableOpacity onPress={() => {
                  confirmAlert(t('institute.cancelCertificate'), t('institute.cancelCertConfirm'), async () => {
                    try {
                      await api.revokeCertificate(cert.id);
                      Alert.alert(t('success') || 'تم', 'تم إلغاء الشهادة');
                      loadData();
                    } catch (err: any) {
                      Alert.alert(t('common.error'), err.message || t('institute.certIssueFailed'));
                    }
                  }, true);
                }}>
                  <Ionicons name="close-circle" size={20} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* ═══ Issue Certificate Modal ═══ */}
      <Modal visible={showIssue} animationType="slide">
        <SafeAreaView style={s.container}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.modalHeader}>
              <TouchableOpacity onPress={() => setShowIssue(false)} accessibilityLabel="إغلاق">
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text }}>{t('institute.issueCertificate')}</Text>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
              {/* Mode Toggle */}
              <View style={s.modeRow}>
                <TouchableOpacity style={[s.modeBtn, issueMode === 'single' && s.modeBtnActive]} onPress={() => setIssueMode('single')}>
                  <Ionicons name="person" size={16} color={issueMode === 'single' ? '#fff' : Colors.textMuted} />
                  <Text style={[s.modeBtnText, issueMode === 'single' && { color: '#fff' }]}>{t('institute.singleStudent')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.modeBtn, issueMode === 'bulk' && s.modeBtnActive]} onPress={() => setIssueMode('bulk')}>
                  <Ionicons name="people" size={16} color={issueMode === 'bulk' ? '#fff' : Colors.textMuted} />
                  <Text style={[s.modeBtnText, issueMode === 'bulk' && { color: '#fff' }]}>{t('institute.fullClass')}</Text>
                </TouchableOpacity>
              </View>

              {/* Certificate Type */}
              <Text style={s.label}>{t('institute.certType')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                {CERT_TYPES.map(ct => (
                  <TouchableOpacity key={ct.key} style={[s.chip, issueType === ct.key && { backgroundColor: ct.color }]} onPress={() => { setIssueType(ct.key); setIncludeGrades(ct.key === 'grades' || ct.key === 'single_subject'); }}>
                    <Ionicons name={ct.icon as any} size={14} color={issueType === ct.key ? '#fff' : ct.color} />
                    <Text style={[s.chipText, issueType === ct.key && { color: '#fff' }]}>{ct.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Theme */}
              <Text style={s.label}>{t('institute.certTheme')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                {REPORT_THEMES.map(th => (
                  <TouchableOpacity key={th.id} style={[s.chip, issueTheme === th.id && { backgroundColor: th.primary }]} onPress={() => setIssueTheme(th.id)}>
                    <Text style={{ fontSize: 16 }}>{th.preview}</Text>
                    <Text style={[s.chipText, issueTheme === th.id && { color: '#fff' }]}>{th.nameAr}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Emoji Toggle */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Switch value={showEmoji} onValueChange={setShowEmoji} trackColor={{ false: '#E2E8F0', true: '#BBF7D0' }} thumbColor={showEmoji ? '#059669' : '#94A3B8'} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{t('institute.showEmoji')}</Text>
              </View>

              {/* Student / Class Selector */}
              {issueMode === 'single' ? (
                <>
                  <Text style={s.label}>{t('institute.selectStudent')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                    {students.map(stu => (
                      <TouchableOpacity key={stu.id} style={[s.chip, selectedStudentId === stu.id && s.chipActive]} onPress={() => setSelectedStudentId(stu.id)}>
                        <Text style={[s.chipText, selectedStudentId === stu.id && { color: '#fff' }]}>{stu.full_name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              ) : (
                <>
                  <Text style={s.label}>{t('institute.selectClass')}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, flexGrow: 0 }}>
                    {classes.map(cls => (
                      <TouchableOpacity key={cls.id} style={[s.chip, selectedClassId === cls.id && s.chipActive]} onPress={() => setSelectedClassId(cls.id)}>
                        <Text style={[s.chipText, selectedClassId === cls.id && { color: '#fff' }]}>{cls.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </>
              )}

              {/* Grade Categories (for grade types) */}
              {(isGradeType || includeGrades) && categories.length > 0 && (
                <>
                  <Text style={s.label}>{t('institute.selectGradePeriods')}</Text>
                  <View style={{ gap: 6, marginBottom: 12 }}>
                    {categories.map(cat => {
                      const selected = selectedCatIds.includes(cat.id);
                      return (
                        <TouchableOpacity key={cat.id} style={[s.catChip, selected && { borderColor: Colors.primary, backgroundColor: '#EEF2FF' }]} onPress={() => {
                          setSelectedCatIds(prev => selected ? prev.filter(id => id !== cat.id) : [...prev, cat.id]);
                        }}>
                          <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={20} color={selected ? Colors.primary : Colors.textMuted} />
                          <Text style={{ flex: 1, textAlign: 'right', fontSize: 13, fontWeight: '700', color: selected ? Colors.primary : Colors.text }}>{cat.name}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {/* Grade Preview + Edit (single mode) */}
              {issueMode === 'single' && (isGradeType || includeGrades) && previewGrades.length > 0 && (
                <>
                  <Text style={s.label}>{t('institute.gradePreview')}</Text>
                  {previewGrades.map((g, i) => (
                    <View key={i} style={s.gradePreviewRow}>
                      <TextInput
                        style={s.gradeInput}
                        value={editingGrades[i]?.maxScore ?? String(g.maxScore)}
                        onChangeText={v => setEditingGrades(prev => ({ ...prev, [i]: { ...prev[i], score: prev[i]?.score ?? String(g.score), maxScore: v } }))}
                        keyboardType="numeric" textAlign="center"
                      />
                      <Text style={{ color: Colors.textMuted }}>/</Text>
                      <TextInput
                        style={[s.gradeInput, { borderColor: Colors.primary }]}
                        value={editingGrades[i]?.score ?? String(g.score)}
                        onChangeText={v => setEditingGrades(prev => ({ ...prev, [i]: { score: v, maxScore: prev[i]?.maxScore ?? String(g.maxScore) } }))}
                        keyboardType="numeric" textAlign="center"
                      />
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{g.subject}</Text>
                        {g.category && <Text style={{ fontSize: 10, color: Colors.textMuted }}>{g.category}</Text>}
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* Title + Description */}
              <Text style={s.label}>{t('institute.certTitleLabel')}</Text>
              <TextInput style={s.input} placeholder={CERT_TYPES.find(ct => ct.key === issueType)?.label || t('institute.certificates')} placeholderTextColor={Colors.textMuted} value={issueTitle} onChangeText={setIssueTitle} textAlign="right" />

              <Text style={s.label}>{t('institute.certDescLabel')}</Text>
              <TextInput style={[s.input, { minHeight: 60 }]} placeholder={t('institute.descriptionPlaceholder')} placeholderTextColor={Colors.textMuted} value={issueDesc} onChangeText={setIssueDesc} textAlign="right" multiline />

              {/* Stamp & Signature Upload */}
              <Text style={s.label}>{t('institute.stampAndSignature')}</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
                <TouchableOpacity style={s.uploadBox} onPress={handleUploadStamp} disabled={uploadingStamp}>
                  {uploadingStamp ? <ActivityIndicator size="small" color={Colors.primary} /> :
                    stampUrl ? <Image source={{ uri: stampUrl }} style={{ width: 50, height: 50, borderRadius: 8 }} /> :
                    <Ionicons name="ribbon-outline" size={28} color={Colors.textMuted} />
                  }
                  <Text style={s.uploadLabel}>{stampUrl ? t('institute.changeStamp') : t('institute.uploadStamp')}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.uploadBox} onPress={handleUploadSignature} disabled={uploadingSig}>
                  {uploadingSig ? <ActivityIndicator size="small" color={Colors.primary} /> :
                    signatureUrl ? <Image source={{ uri: signatureUrl }} style={{ width: 50, height: 50, borderRadius: 8 }} /> :
                    <Ionicons name="pencil-outline" size={28} color={Colors.textMuted} />
                  }
                  <Text style={s.uploadLabel}>{signatureUrl ? t('institute.changeSignature') : t('institute.uploadSignature')}</Text>
                </TouchableOpacity>
              </View>

              {/* Preview PDF Button */}
              <TouchableOpacity style={s.previewBtn} onPress={handlePreviewPDF}>
                <Ionicons name="eye" size={18} color="#4F46E5" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#4F46E5' }}>{t('institute.previewCertPDF')}</Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Issue Button */}
            <View style={s.bottomBar}>
              <TouchableOpacity style={[s.saveBtn, issuing && { opacity: 0.6 }]} onPress={handleIssue} disabled={issuing}>
                {issuing ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="ribbon" size={18} color="#fff" />
                    <Text style={s.saveBtnText}>
                      {issueMode === 'single' ? t('institute.issueCertificate') : t('institute.issueForAllClass')}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '900', color: Colors.text },
  issueBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8 },
  issueBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  stat: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center' },
  statVal: { fontSize: 20, fontWeight: '900' },
  statLabel: { fontSize: 10, color: '#64748B', marginTop: 2 },
  certCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  certTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  pdfBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  empty: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', paddingVertical: 40 },
  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 6 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', marginRight: 8 },
  chipActive: { backgroundColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: '#fff' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9' },
  modeBtnActive: { backgroundColor: Colors.primary },
  modeBtnText: { fontSize: 13, fontWeight: '800', color: Colors.textMuted },
  gradePreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 4, borderWidth: 1, borderColor: Colors.border },
  gradeInput: { width: 50, height: 36, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: Colors.border, fontSize: 14, fontWeight: '800', color: Colors.text },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: Colors.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#059669', borderRadius: 14, paddingVertical: 16 },
  saveBtnText: { fontSize: 14, fontWeight: '800', color: '#fff' },
  uploadBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderColor: Colors.border, borderStyle: 'dashed', paddingVertical: 16 },
  uploadLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted },
  previewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EEF2FF', borderRadius: 14, paddingVertical: 14, marginBottom: 16, borderWidth: 1, borderColor: '#C7D2FE' },
});
