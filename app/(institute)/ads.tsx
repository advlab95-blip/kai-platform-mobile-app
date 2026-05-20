import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../constants/theme';
import { tokens as dtokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import SkeletonList from '../../components/shared/SkeletonList';
import AdFormModal from '../../components/institute/AdFormModal';
import type { AdminAd } from '../../types';
import { haptics } from '../../utils/haptics';
import FadeSlideIn from '../../components/animated/FadeSlideIn';

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-IQ', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function statusFor(ad: AdminAd): { label: string; color: string; bg: string } {
  if (!ad.is_active) return { label: 'معطّل', color: tokens.text[3], bg: tokens.surface.surface2 };
  const now = Date.now();
  if (new Date(ad.starts_at).getTime() > now) return { label: 'مجدول', color: tokens.semantic.warning, bg: tokens.semantic.warningBg };
  if (ad.expires_at && new Date(ad.expires_at).getTime() <= now) return { label: 'منتهي', color: tokens.semantic.danger, bg: tokens.semantic.dangerBg };
  return { label: 'نشط', color: tokens.semantic.success, bg: tokens.semantic.successBg };
}

export default function InstituteAdsPage() {
  const { userId } = useAuthStore();
  const { userInstituteId, isFetching, detectInstitute } = useDataStore();

  const [ads, setAds] = useState<AdminAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminAd | null>(null);

  const load = useCallback(async () => {
    if (!userInstituteId) return;
    try {
      const list = await api.getAdminAds(userInstituteId);
      setAds(list);
    } catch (err) {
      console.error('load ads', err);
    } finally {
      setLoading(false);
    }
  }, [userInstituteId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!userInstituteId && userId && !isFetching) detectInstitute(userId);
  }, [userInstituteId, userId, isFetching, detectInstitute]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await load(); } finally { setRefreshing(false); }
  }, [load]);

  const handleToggle = async (ad: AdminAd) => {
    const next = !ad.is_active;
    setAds((prev) => prev.map((x) => x.id === ad.id ? { ...x, is_active: next } : x));
    try {
      await api.toggleAd(ad.id, next);
    } catch (err: any) {
      setAds((prev) => prev.map((x) => x.id === ad.id ? { ...x, is_active: ad.is_active } : x));
      Alert.alert('خطأ', err.message || 'فشل تغيير الحالة');
    }
  };

  const handleDelete = async (ad: AdminAd) => {
    haptics.warning();
    const previous = ads;
    setAds((prev) => prev.filter((x) => x.id !== ad.id));
    try {
      await api.deleteAd(ad.id);
    } catch (err: any) {
      setAds(previous);
      Alert.alert('خطأ', err.message || 'فشل الحذف');
    }
  };

  const openNew = () => { haptics.light(); setEditing(null); setFormOpen(true); };
  const openEdit = (ad: AdminAd) => { haptics.light(); setEditing(ad); setFormOpen(true); };

  const renderItem = ({ item, index }: { item: AdminAd; index: number }) => {
    const st = statusFor(item);
    return (
      <FadeSlideIn delay={Math.min(index * 40, 400)} translateFrom={10}>
        <View style={styles.row}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.thumb} contentFit="cover" />
          ) : (
            <View style={[styles.thumb, styles.thumbFallback]}>
              <Ionicons name="megaphone" size={26} color={tokens.brand[500]} />
            </View>
          )}
          <View style={styles.rowMain}>
            <View style={styles.rowHeader}>
              <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
                <Text style={[styles.statusText, { color: st.color }]}>{st.label}</Text>
              </View>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
            </View>
            {!!item.body && (
              <Text style={styles.body} numberOfLines={2}>{item.body}</Text>
            )}
            <View style={styles.meta}>
              <View style={styles.metaItem}>
                <Ionicons name="eye-outline" size={12} color={tokens.text[4]} />
                <Text style={styles.metaText}>{item.views_count}</Text>
              </View>
              <View style={styles.metaItem}>
                <Ionicons name="calendar-outline" size={12} color={tokens.text[4]} />
                <Text style={styles.metaText}>
                  {fmtDate(item.starts_at)} - {fmtDate(item.expires_at)}
                </Text>
              </View>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)} activeOpacity={0.8}>
                <Ionicons name="create-outline" size={16} color={tokens.brand[500]} />
                <Text style={styles.actionText}>تعديل</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleToggle(item)} activeOpacity={0.8}>
                <Ionicons
                  name={item.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={16}
                  color={tokens.semantic.info}
                />
                <Text style={[styles.actionText, { color: tokens.semantic.info }]}>
                  {item.is_active ? 'إيقاف' : 'تشغيل'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)} activeOpacity={0.8}>
                <Ionicons name="trash-outline" size={16} color={tokens.semantic.danger} />
                <Text style={[styles.actionText, { color: tokens.semantic.danger }]}>حذف</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </FadeSlideIn>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الإعلانات"
        gradient={dtokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />
      {loading ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <SkeletonList count={5} cardHeight={96} />
        </View>
      ) : ads.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="megaphone-outline" size={36} color={tokens.brand[500]} />
          </View>
          <Text style={styles.emptyTitle}>لا توجد إعلانات</Text>
          <Text style={styles.emptyHint}>اضغط على "+" لإنشاء أول إعلان</Text>
        </View>
      ) : (
        <FlashList
          data={ads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.brand[500]} />
          }
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={openNew} activeOpacity={0.9}>
        <LinearGradient
          colors={tokens.broadcastGradient as any}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.fabInner}
        >
          <Ionicons name="add" size={26} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>

      {userInstituteId && userId && (
        <AdFormModal
          visible={formOpen}
          onClose={() => setFormOpen(false)}
          onSaved={load}
          instituteId={userInstituteId}
          actorId={userId}
          ad={editing}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.surface.bg },

  row: {
    flexDirection: 'row-reverse',
    gap: 12,
    backgroundColor: tokens.surface.surface,
    marginHorizontal: 14, marginVertical: 6,
    padding: 12,
    borderRadius: tokens.radius.lg,
    borderWidth: 1, borderColor: tokens.border[2],
    ...tokens.shadow.xs,
  },
  thumb: { width: 72, height: 72, borderRadius: tokens.radius.md },
  thumbFallback: {
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowHeader: { flexDirection: 'row-reverse', alignItems: 'center', gap: 8, marginBottom: 4 },
  statusPill: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99 },
  statusText: { fontSize: 11, fontWeight: '800' },
  title: { flex: 1, fontSize: 14, fontWeight: '800', color: tokens.text[1], textAlign: 'right' },
  body: { fontSize: 12, color: tokens.text[3], textAlign: 'right', marginBottom: 6, lineHeight: 18 },
  meta: { flexDirection: 'row-reverse', gap: 12, marginBottom: 8 },
  metaItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 11, color: tokens.text[4], fontWeight: '500' },

  actions: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 6,
    borderTopWidth: 1, borderTopColor: tokens.border[2], paddingTop: 8,
  },
  actionBtn: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: tokens.radius.sm,
  },
  actionText: { fontSize: 12, fontWeight: '700', color: tokens.brand[500] },

  fab: {
    position: 'absolute', bottom: 26, left: 20,
    width: 58, height: 58, borderRadius: 29,
    ...tokens.shadow.md,
  },
  fabInner: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center',
  },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 6 },
  emptyIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: tokens.brand[100],
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: tokens.text[1] },
  emptyHint: { fontSize: 13, color: tokens.text[3], fontWeight: '500' },
});
