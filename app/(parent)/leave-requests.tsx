// ParentLeaveRequests — submit + track absence requests for a selected child.
// Multi-tenant: requestedBy = parent userId, subjectId = child.id, instituteId = child.instituteId.
// On admin approval (server-side), api.approveLeaveRequest creates an excused
// attendance row for each leave date, so the child is NOT marked absent.
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  Image, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';

import useAuthStore from '../../stores/authStore';
import useParentStore from '../../stores/parentStore';
import useDataStore from '../../stores/dataStore';
import ChildSwitcher from '../../components/shared/ChildSwitcher';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { api } from '../../services/api';
import { bunnyStorage } from '../../services/bunny';
import { compressImage } from '../../utils/imageCompress';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import { haptics } from '../../utils/haptics';

const TYPES: { key: string; label: string; icon: any }[] = [
  { key: 'sick_day',    label: 'مرض',         icon: 'medkit' },
  { key: 'personal',    label: 'ظرف شخصي',     icon: 'person-circle' },
  { key: 'multi_day',   label: 'إجازة متعددة', icon: 'calendar' },
  { key: 'early_leave', label: 'انصراف مبكر',  icon: 'exit' },
];

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  pending:   { bg: '#FEF3C7', text: '#B45309', label: 'قيد المراجعة' },
  approved:  { bg: '#DCFCE7', text: '#059669', label: 'موافق عليه' },
  rejected:  { bg: '#FEE2E2', text: '#DC2626', label: 'مرفوض' },
  cancelled: { bg: '#F1F5F9', text: '#64748B', label: 'ملغي' },
};

function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export default function ParentLeaveRequests() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { children, selectedChildId } = useParentStore();
  const { userInstituteId } = useDataStore();

  const selectedChild = children.find((c) => c.id === selectedChildId);
  const childInstituteId = selectedChild?.instituteId || userInstituteId;

  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('sick_day');
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Optional attachment image (medical note, etc.). Stays local until the user
  // submits — we only upload during handleSubmit so abandoned forms don't burn
  // Bunny bandwidth or leave orphaned files.
  const [attachmentLocalUri, setAttachmentLocalUri] = useState<string | null>(null);
  const [pickingAttachment, setPickingAttachment] = useState(false);

  const loadMine = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const data = await api.getMyLeaveRequests(userId);
      setRequests(data);
    } catch (err: any) {
      Alert.alert(t('common.error', { defaultValue: 'خطأ' }), err?.message || 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [userId, t]);

  useEffect(() => { loadMine(); }, [loadMine]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadMine(); } finally { setRefreshing(false); }
  }, [loadMine]);

  const resetForm = () => {
    setType('sick_day');
    setStartDate(todayStr());
    setEndDate('');
    setReason('');
    setAttachmentLocalUri(null);
  };

  // Pick an image from the device library — compressed for bandwidth.
  // We deliberately do NOT upload here; upload happens on submit so the user
  // can change their mind without leaving orphan files on Bunny.
  const handlePickAttachment = useCallback(async () => {
    if (pickingAttachment) return;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('الصلاحيات', 'يرجى السماح بالوصول للصور');
        return;
      }
      setPickingAttachment(true);
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (picked.canceled || !picked.assets?.[0]?.uri) return;
      const compressed = await compressImage(picked.assets[0].uri);
      setAttachmentLocalUri(compressed);
      haptics.light();
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل اختيار الصورة');
    } finally {
      setPickingAttachment(false);
    }
  }, [pickingAttachment]);

  const handleSubmit = async () => {
    if (!userId || !selectedChildId || !selectedChild || !childInstituteId) {
      Alert.alert('تنبيه', 'اختر طفلاً أولاً');
      return;
    }
    if (!isValidDate(startDate)) {
      Alert.alert('تنبيه', 'تاريخ البداية غير صحيح (YYYY-MM-DD)');
      return;
    }
    if (endDate && !isValidDate(endDate)) {
      Alert.alert('تنبيه', 'تاريخ النهاية غير صحيح');
      return;
    }
    if (endDate && new Date(endDate) < new Date(startDate)) {
      Alert.alert('تنبيه', 'تاريخ النهاية قبل البداية');
      return;
    }
    if (!reason.trim() || reason.trim().length < 5) {
      Alert.alert('تنبيه', 'اكتب سبباً واضحاً (5 أحرف فأكثر)');
      return;
    }
    setSubmitting(true);
    try {
      // Upload attachment FIRST (if any). If upload fails, abort the submit so
      // we don't get a request without its evidence. The allowlisted `tasks`
      // folder is reused for parent-submitted attachments — same RLS surface
      // as student task uploads and avoids deploying a new edge-function
      // allowlist entry. The server prepends institute_id so cross-tenant
      // collisions are impossible.
      let attachmentUrl: string | undefined;
      if (attachmentLocalUri) {
        try {
          attachmentUrl = await bunnyStorage.uploadFile(attachmentLocalUri, 'tasks');
        } catch (uploadErr: any) {
          Alert.alert('خطأ', `فشل رفع المرفق: ${uploadErr?.message || 'تحقق من الاتصال'}`);
          setSubmitting(false);
          return;
        }
      }
      await api.submitLeaveRequest({
        instituteId: childInstituteId,
        requestedBy: userId,
        requesterRole: 'parent',
        subjectId: selectedChildId,
        subjectType: 'student',
        subjectName: selectedChild.name,
        type,
        startDate,
        endDate: endDate || undefined,
        reason: reason.trim(),
        attachmentUrl,
      });
      haptics.success();
      resetForm();
      setShowForm(false);
      await loadMine();
      Alert.alert('تم', 'تم إرسال الطلب — ستصلك إشعار عند الرد');
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'فشل إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = (req: any) => {
    Alert.alert('إلغاء الطلب', `إلغاء طلب ${req.subject_name}؟`, [
      { text: 'تراجع', style: 'cancel' },
      {
        text: 'إلغاء',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.cancelLeaveRequest(req.id);
            await loadMine();
          } catch (err: any) {
            Alert.alert('خطأ', err?.message || 'فشل');
          }
        },
      },
    ]);
  };

  // Filter list to currently selected child (parents may have multiple kids)
  const visibleRequests = selectedChildId
    ? requests.filter((r) => r.subject_id === selectedChildId)
    : requests;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="طلبات الإجازة"
        subtitle={selectedChild?.name ? `مقدّم لـ ${selectedChild.name}` : 'اختر طفلاً'}
        gradient={tokens.gradient.parent}
        glowAccent="rgba(167,139,250,0.30)"
        fallbackRoute="/(parent)/services"
      />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.p600} />
          }
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
        >
          <ChildSwitcher />

          {/* New request CTA */}
          {!showForm ? (
            <TouchableOpacity
              style={styles.cta}
              onPress={() => { haptics.light(); setShowForm(true); }}
              activeOpacity={0.85}
              accessibilityRole="button"
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.ctaText}>طلب إجازة جديد</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>طلب إجازة جديد</Text>

              {/* Type chips */}
              <Text style={styles.label}>نوع الإجازة</Text>
              <View style={styles.typeRow}>
                {TYPES.map((tp) => (
                  <TouchableOpacity
                    key={tp.key}
                    style={[styles.typeChip, type === tp.key && styles.typeChipActive]}
                    onPress={() => { haptics.selection(); setType(tp.key); }}
                  >
                    <Ionicons
                      name={tp.icon}
                      size={14}
                      color={type === tp.key ? '#fff' : tokens.color.p600}
                    />
                    <Text style={[styles.typeChipText, type === tp.key && styles.typeChipTextActive]}>
                      {tp.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Quick date chips */}
              <Text style={styles.label}>تاريخ البداية</Text>
              <View style={styles.quickRow}>
                {[
                  { l: 'اليوم',     v: todayStr(0) },
                  { l: 'غداً',       v: todayStr(1) },
                  { l: 'بعد غد',    v: todayStr(2) },
                ].map((q) => (
                  <TouchableOpacity
                    key={q.v}
                    style={[styles.quickChip, startDate === q.v && styles.quickChipActive]}
                    onPress={() => { haptics.selection(); setStartDate(q.v); }}
                  >
                    <Text style={[styles.quickText, startDate === q.v && styles.quickTextActive]}>{q.l}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                value={startDate}
                onChangeText={setStartDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={tokens.color.text3}
                keyboardType="numbers-and-punctuation"
              />

              {(type === 'multi_day' || type === 'sick_day') && (
                <>
                  <Text style={styles.label}>تاريخ النهاية (اختياري)</Text>
                  <TextInput
                    style={styles.input}
                    value={endDate}
                    onChangeText={setEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={tokens.color.text3}
                    keyboardType="numbers-and-punctuation"
                  />
                </>
              )}

              <Text style={styles.label}>السبب</Text>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={reason}
                onChangeText={setReason}
                placeholder="اشرح السبب باختصار..."
                placeholderTextColor={tokens.color.text3}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Optional image attachment — medical note, doc, etc. */}
              <Text style={styles.label}>مرفق (اختياري)</Text>
              {attachmentLocalUri ? (
                <View style={styles.attachmentPreview}>
                  <Image source={{ uri: attachmentLocalUri }} style={styles.attachmentImg} />
                  <TouchableOpacity
                    style={styles.attachmentRemove}
                    onPress={() => { haptics.light(); setAttachmentLocalUri(null); }}
                    accessibilityLabel="إزالة المرفق"
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.attachmentPickBtn}
                  onPress={handlePickAttachment}
                  disabled={pickingAttachment}
                  activeOpacity={0.85}
                >
                  {pickingAttachment ? (
                    <ActivityIndicator color={tokens.color.p600} size="small" />
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={18} color={tokens.color.p600} />
                      <Text style={styles.attachmentPickText}>إضافة صورة</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              <View style={styles.formActions}>
                <TouchableOpacity
                  style={[styles.btn, styles.btnGhost]}
                  onPress={() => { setShowForm(false); resetForm(); }}
                  disabled={submitting}
                >
                  <Text style={styles.btnGhostText}>إلغاء</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btn, styles.btnPrimary]}
                  onPress={handleSubmit}
                  disabled={submitting}
                  activeOpacity={0.85}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnPrimaryText}>إرسال</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Requests list */}
          <View style={{ paddingHorizontal: 16, marginTop: 6 }}>
            <Text style={styles.sectionTitle}>الطلبات السابقة</Text>
            {loading ? (
              <ActivityIndicator color={tokens.color.p600} style={{ paddingTop: 24 }} />
            ) : visibleRequests.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="document-outline" size={36} color={tokens.color.text3} />
                <Text style={styles.emptyText}>لا توجد طلبات بعد</Text>
              </View>
            ) : (
              visibleRequests.map((req) => {
                const st = STATUS[req.status] || STATUS.pending;
                const tp = TYPES.find((x) => x.key === req.type);
                return (
                  <View key={req.id} style={styles.card}>
                    <View style={styles.cardHead}>
                      <View style={[styles.badge, { backgroundColor: st.bg }]}>
                        <Text style={[styles.badgeText, { color: st.text }]}>{st.label}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.cardName}>{req.subject_name}</Text>
                        {tp ? <Ionicons name={tp.icon} size={16} color={tokens.color.p600} /> : null}
                      </View>
                    </View>
                    <Text style={styles.cardMeta}>
                      {tp?.label || req.type} — {req.start_date}
                      {req.end_date && req.end_date !== req.start_date ? ` ← ${req.end_date}` : ''}
                    </Text>
                    <Text style={styles.cardReason}>{req.reason}</Text>
                    {req.attachment_url ? (
                      <TouchableOpacity
                        style={styles.attachmentLink}
                        onPress={() => req.attachment_url && Linking.openURL(req.attachment_url)}
                        activeOpacity={0.85}
                      >
                        <Ionicons name="attach" size={14} color={tokens.color.p600} />
                        <Text style={styles.attachmentLinkText}>عرض المرفق</Text>
                      </TouchableOpacity>
                    ) : null}
                    {req.review_notes ? (
                      <Text style={styles.cardNotes}>ملاحظة الإدارة: {req.review_notes}</Text>
                    ) : null}
                    {req.status === 'pending' ? (
                      <TouchableOpacity
                        style={styles.cancelBtn}
                        onPress={() => handleCancel(req)}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.cancelText}>إلغاء الطلب</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  cta: {
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: tokens.color.p600,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { color: '#fff', fontSize: tokens.font.size.lg, fontWeight: tokens.font.weight.heavy },

  formCard: {
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: tokens.color.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  formTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
  },
  label: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 8,
    marginBottom: 6,
    fontWeight: tokens.font.weight.bold,
  },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: 'rgba(167,139,250,0.10)',
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  typeChipActive: { backgroundColor: tokens.color.p600 },
  typeChipText: { fontSize: tokens.font.size.sm, color: tokens.color.p600, fontWeight: tokens.font.weight.bold },
  typeChipTextActive: { color: '#fff' },

  quickRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  quickChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  quickChipActive: { backgroundColor: tokens.color.p600 },
  quickText: { fontSize: tokens.font.size.xs, color: tokens.color.text2, fontWeight: tokens.font.weight.bold },
  quickTextActive: { color: '#fff' },

  input: {
    borderWidth: 1, borderColor: tokens.color.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: tokens.font.size.base, color: tokens.color.text,
    backgroundColor: '#fff', textAlign: 'right',
  },
  textarea: { minHeight: 70 },

  formActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: '#F1F5F9' },
  btnGhostText: { color: tokens.color.text2, fontWeight: tokens.font.weight.heavy },
  btnPrimary: { backgroundColor: tokens.color.p600 },
  btnPrimaryText: { color: '#fff', fontWeight: tokens.font.weight.heavy },

  sectionTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 10,
  },
  empty: { alignItems: 'center', paddingTop: 40, paddingBottom: 20 },
  emptyText: { fontSize: tokens.font.size.md, color: tokens.color.text3, marginTop: 8 },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardName: { fontSize: tokens.font.size.md, fontWeight: tokens.font.weight.heavy, color: tokens.color.text },
  cardMeta: { fontSize: tokens.font.size.xs, color: tokens.color.p600, textAlign: 'right', marginTop: 4 },
  cardReason: { fontSize: tokens.font.size.sm, color: tokens.color.text2, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  cardNotes: { fontSize: tokens.font.size.xs, color: Colors.textMuted, textAlign: 'right', marginTop: 6, fontStyle: 'italic' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cancelBtn: {
    marginTop: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: '#FEE2E2', alignItems: 'center',
  },
  cancelText: { fontSize: tokens.font.size.sm, color: '#DC2626', fontWeight: tokens.font.weight.heavy },

  attachmentPickBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10,
    backgroundColor: 'rgba(167,139,250,0.10)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.30)', borderStyle: 'dashed',
  },
  attachmentPickText: {
    fontSize: tokens.font.size.sm, color: tokens.color.p600,
    fontWeight: tokens.font.weight.bold,
  },
  attachmentPreview: { position: 'relative', alignSelf: 'flex-start' },
  attachmentImg: { width: 120, height: 120, borderRadius: 10, backgroundColor: '#F1F5F9' },
  attachmentRemove: {
    position: 'absolute', top: 6, right: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12, padding: 4,
  },
  attachmentLink: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    gap: 4, marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, backgroundColor: 'rgba(167,139,250,0.10)',
  },
  attachmentLinkText: {
    fontSize: tokens.font.size.xs, color: tokens.color.p600,
    fontWeight: tokens.font.weight.bold,
  },
});
