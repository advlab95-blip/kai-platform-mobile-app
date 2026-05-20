import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { confirmAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import SectionLabel from '../../components/institute/SectionLabel';
import ErrorState from '../../components/shared/ErrorState';

export default function InstituteArchive() {
  const { userId } = useAuthStore();
  const { t } = useTranslation();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [videos, setVideos] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [tab, setTab] = useState<'videos' | 'materials'>('videos');
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadData = async () => {
    if (!userInstituteId) {
      setLoading(false);
      return;
    }
    try {
      setLoadError(null);
      const data = await api.getArchivedContent(userInstituteId);
      setVideos(data.videos);
      setMaterials(data.materials);
    } catch (err: any) {
      console.error('[archive] load', err);
      setLoadError(err?.message || 'تعذّر تحميل الأرشيف');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [userInstituteId]);
  const onRefresh = useCallback(async () => {
    haptics.light(); setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [userInstituteId]);

  const handleRestore = (table: 'videos' | 'materials', item: any) => {
    confirmAlert(t('institute.restoreTitle'), `${t('institute.restoreTitle')} "${item.title}"؟`, async () => {
      try { await api.restoreFromArchive(table, item.id); Alert.alert(t('common.success'), t('institute.restored')); loadData(); }
      catch (err: any) { Alert.alert(t('common.error'), err.message); }
    });
  };

  const handleDelete = (table: 'videos' | 'materials', item: any) => {
    confirmAlert(t('common.permanentDelete'), `${t('common.permanentDelete')} "${item.title}"؟\n\n${t('common.cannotUndo')}`, async () => {
      try { await api.permanentlyDeleteContent(table, item.id); Alert.alert(t('common.success'), t('institute.deletedPermanently')); loadData(); }
      catch (err: any) { Alert.alert(t('common.error'), err.message); }
    }, true);
  };

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) { detectInstitute(userId); }
  }, [userInstituteId, userId, isFetching]);

  if (!userInstituteId) {
    return (
      <SafeAreaView style={s.c}>
        <View style={s.centerFill}>
          <ActivityIndicator size="large" color={tokens.brand[500]} />
          <Text style={s.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) return (
    <SafeAreaView style={s.c}>
      <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
        <SkeletonList count={6} cardHeight={88} />
      </View>
    </SafeAreaView>
  );

  if (loadError) return (
    <SafeAreaView style={s.c}>
      <ErrorState
        title="تعذّر تحميل الأرشيف"
        message={loadError}
        onRetry={() => { setLoading(true); loadData(); }}
      />
    </SafeAreaView>
  );

  const items = tab === 'videos' ? videos : materials;

  return (
    <SafeAreaView style={s.c} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('institute.archiveTitle')}
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <SectionLabel title="التصنيف" icon="albums-outline" />
        </View>
        <View style={s.tabRow}>
          <TouchableOpacity
            style={[s.tab, tab === 'videos' && s.tabActive]}
            onPress={() => { haptics.light(); setTab('videos'); }}
            activeOpacity={0.85}
          >
            <Ionicons name="videocam" size={16} color={tab === 'videos' ? '#fff' : tokens.text[3]} />
            <Text style={[s.tabText, tab === 'videos' && { color: '#fff' }]}>
              {t('student.videosTab')} ({videos.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, tab === 'materials' && s.tabActive]}
            onPress={() => { haptics.light(); setTab('materials'); }}
            activeOpacity={0.85}
          >
            <Ionicons name="document-attach" size={16} color={tab === 'materials' ? '#fff' : tokens.text[3]} />
            <Text style={[s.tabText, tab === 'materials' && { color: '#fff' }]}>
              {t('student.materialsTab')} ({materials.length})
            </Text>
          </TouchableOpacity>
        </View>

        {items.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIconWrap}>
              <Ionicons name="archive-outline" size={36} color={tokens.brand[500]} />
            </View>
            <Text style={s.emptyText}>{t('admin.noArchivedContent')}</Text>
          </View>
        ) : items.map((item, i) => (
          <FadeSlideIn key={item.id} delay={Math.min(i * 30, 400)} translateFrom={8}>
            <View style={s.card}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={s.restoreBtn} onPress={() => handleRestore(tab, item)} activeOpacity={0.8}>
                  <Ionicons name="refresh" size={16} color={tokens.semantic.success} />
                </TouchableOpacity>
                <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(tab, item)} activeOpacity={0.8}>
                  <Ionicons name="trash" size={16} color={tokens.semantic.danger} />
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
                <Text style={s.itemTitle}>{item.title}</Text>
                <Text style={s.itemMeta}>
                  {item.users?.full_name || 'أستاذ'} — {item.archived_at ? new Date(item.archived_at).toLocaleDateString('ar-IQ') : ''}
                </Text>
              </View>
              <View style={s.iconBadge}>
                <Ionicons name={tab === 'videos' ? 'videocam' : 'document-attach'} size={18} color={tokens.brand[500]} />
              </View>
            </View>
          </FadeSlideIn>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: tokens.surface.bg },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { fontSize: 13, color: tokens.text[3], marginTop: 12, fontWeight: '500' },

  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 11,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.surface.surface,
    borderWidth: 1, borderColor: tokens.border[2],
  },
  tabActive: { backgroundColor: tokens.brand[500], borderColor: tokens.brand[500] },
  tabText: { fontSize: 13, fontWeight: '700', color: tokens.text[2] },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.md,
    padding: 12, marginHorizontal: 16, marginBottom: 8,
    borderWidth: 1, borderColor: tokens.border[2],
    gap: 10,
    ...tokens.shadow.xs,
  },
  itemTitle: { fontSize: 14, fontWeight: '800', color: tokens.text[1] },
  itemMeta: { fontSize: 11, color: tokens.text[3], fontWeight: '500' },
  iconBadge: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  restoreBtn: { backgroundColor: tokens.semantic.successBg, borderRadius: 8, padding: 8 },
  deleteBtn: { backgroundColor: tokens.semantic.dangerBg, borderRadius: 8, padding: 8 },

  emptyWrap: { alignItems: 'center', paddingTop: 80 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  emptyText: { fontSize: 13, color: tokens.text[3], fontWeight: '500' },
});
