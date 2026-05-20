import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useTranslation } from 'react-i18next';
import { exportCertificatePDF, exportGradeReportCertPDF } from '../../services/pdfExport';
import { haptics } from '../../utils/haptics';
import IconButton from '../../components/teacher/buttons/IconButton';
import EmptyState from '../../components/shared/EmptyState';
import SkeletonList from '../../components/shared/SkeletonList';

export default function StudentCertificates() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const isEnabled = useFeatureFlag('certificates');
  const [certificates, setCertificates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) return;
    try {
      setLoadError(null);
      const data = await api.getStudentCertificates(userId, userInstituteId || undefined);
      setCertificates(data);
    } catch (err: any) {
      setLoadError(err?.message || t('common.loadFailed', { defaultValue: 'فشل التحميل' }));
    } finally {
      setLoading(false);
    }
  }, [userId, userInstituteId, t]);

  useEffect(() => { loadData(); }, [userId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  const handleDownload = async (cert: any) => {
    if (downloadingId) return;
    haptics.selection();
    setDownloadingId(cert.id);
    try {
      const extraData = cert.data || {};
      if (extraData.themeId) {
        await exportGradeReportCertPDF({
          studentName: cert.users?.full_name || '',
          instituteName: cert.institutes?.name || '',
          title: cert.title, description: cert.description,
          grades: extraData.grades, issuedAt: cert.issued_at,
          type: extraData.type || cert.type || 'excellence',
          themeId: extraData.themeId, showEmoji: extraData.showEmoji,
          stampUrl: extraData.stampUrl, signatureUrl: extraData.signatureUrl,
        });
      } else {
        await exportCertificatePDF({
          title: cert.title, studentName: cert.users?.full_name || '',
          instituteName: cert.institutes?.name || '',
          description: cert.description, verificationCode: cert.verification_code,
          issuedAt: cert.issued_at,
        });
      }
    } catch (err: any) {
      const { Alert } = await import('react-native');
      Alert.alert(t('common.error'), err?.message || t('common.downloadFailed', { defaultValue: 'فشل التحميل' }));
    } finally {
      setDownloadingId(null);
    }
  };

  if (!isEnabled) {
    return (
      <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
        <RoleInnerHero
          title={t('student.myCertificates')}
          gradient={tokens.gradient.student}
          glowAccent="rgba(20,184,166,0.30)"
        />
        <View style={s.lockWrap}>
          <Ionicons name="lock-closed" size={48} color={tokens.color.text4} />
          <Text style={s.lockText}>{t('student.featureDisabled')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={`${t('student.myCertificates')} (${certificates.length})`}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {loading ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
            <SkeletonList count={4} cardHeight={120} />
          </View>
        ) : certificates.length === 0 ? (
          <EmptyState
            icon="ribbon-outline"
            title={t('student.noCertificatesYet', { defaultValue: 'لا توجد شهادات بعد' })}
            message={t('student.certificatesAppearHere')}
          />
        ) : (
          <View style={{ paddingHorizontal: 16 }}>
            {certificates.map((cert: any) => (
              <View key={cert.id} style={s.card}>
                {/* Top row: download button (start) + ribbon icon (end) */}
                <View style={s.cardTopRow}>
                  <IconButton
                    icon="download-outline"
                    onPress={() => handleDownload(cert)}
                    variant="surface"
                    accessibilityLabel={t('student.downloadPDF')}
                  />
                  <View style={s.certIcon}>
                    <Ionicons name="ribbon" size={22} color={tokens.color.cyan} />
                  </View>
                </View>

                <Text style={s.certTitle} numberOfLines={2}>{cert.title}</Text>
                {cert.description ? (
                  <Text style={s.certDesc} numberOfLines={2}>{cert.description}</Text>
                ) : null}

                <View style={s.footerRow}>
                  <Text style={s.certCode}>{cert.verification_code}</Text>
                  <Text style={s.certDate}>
                    {new Date(cert.issued_at).toLocaleDateString('ar-IQ')}
                  </Text>
                </View>

                {cert.institutes?.name ? (
                  <Text style={s.certInst}>{cert.institutes.name}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  lockWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lockText: { fontSize: tokens.font.size.xl, color: tokens.color.text3, marginTop: 12 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    writingDirection: 'rtl',
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.cyanBg,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: tokens.font.size['3xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },

  emptyWrap: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 20 },
  emptyTitle: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text2,
    marginTop: 16,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    marginTop: 6,
    textAlign: 'center',
  },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[5],
    marginBottom: 12,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  certIcon: {
    width: 48, height: 48, borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.cyanBg,
    alignItems: 'center', justifyContent: 'center',
  },
  certTitle: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  certDesc: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
    marginTop: 6,
    lineHeight: 22,
    writingDirection: 'rtl',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border2,
  },
  certCode: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.cyan,
    fontFamily: 'monospace',
    letterSpacing: 1,
    fontWeight: tokens.font.weight.bold,
  },
  certDate: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text3,
  },
  certInst: {
    fontSize: tokens.font.size.sm,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 6,
    writingDirection: 'rtl',
  },
});
