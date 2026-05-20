import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import FilterChip from '../../components/teacher/chips/FilterChip';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useStudentStore from '../../stores/studentStore';
import { api } from '../../services/api';
import { haptics } from '../../utils/haptics';

type SubjectTab = 'videos' | 'exams' | 'assignments' | 'materials' | 'galleries';

const TAB_META: { key: SubjectTab; label: string; icon: keyof typeof Ionicons.glyphMap; tint: string; tintBg: string }[] = [
  { key: 'videos',      label: 'فيديوهات', icon: 'videocam',      tint: tokens.color.danger,  tintBg: tokens.color.dangerBg },
  { key: 'exams',       label: 'امتحانات', icon: 'document-text', tint: tokens.color.purple,  tintBg: tokens.color.purpleBg },
  { key: 'assignments', label: 'واجبات',   icon: 'book',          tint: tokens.color.info,    tintBg: tokens.color.infoBg },
  { key: 'materials',   label: 'ملازم',    icon: 'storefront',    tint: tokens.color.warning, tintBg: tokens.color.warningBg },
  { key: 'galleries',   label: 'صور',      icon: 'images',        tint: tokens.color.pink,    tintBg: tokens.color.pinkBg },
];

export default function StudentSubjectDetail() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; name: string }>();
  const subjectId = params.id as string;
  const subjectName = (params.name as string) || 'مادة';

  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  const { classId, selectedClassId } = useStudentStore();
  const activeClassId = selectedClassId || classId;

  const [activeTab, setActiveTab] = useState<SubjectTab>('videos');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [videos, setVideos] = useState<any[]>([]);
  const [exams, setExams] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [galleries, setGalleries] = useState<any[]>([]);

  // Client-side filter on loaded lists — the APIs return all items for the
  // student; we narrow to items whose subject_id matches this subject.
  const bySubject = <T extends { subject_id?: string | null }>(arr: T[]): T[] =>
    (arr || []).filter(x => x.subject_id === subjectId);

  const loadAll = useCallback(async () => {
    if (!userId || !userInstituteId) return;
    setLoading(true);
    try {
      const [vids, exms, asgn, mats, galls] = await Promise.all([
        api.getVideosByInstitute(userInstituteId, activeClassId || undefined, userId),
        api.getStudentExams(userId, activeClassId || undefined, userId),
        api.getStudentAssignmentsList(userId, activeClassId || undefined),
        api.getMaterials(userInstituteId, userId),
        api.getGalleriesByInstitute(userInstituteId, activeClassId || undefined, userId),
      ]);
      setVideos(bySubject(vids as any[]));
      setExams(bySubject(exms as any[]));
      setAssignments(bySubject(asgn as any[]));
      setMaterials(bySubject(mats as any[]));
      setGalleries(bySubject(galls as any[]));
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || 'فشل التحميل');
    } finally {
      setLoading(false);
    }
  }, [userId, userInstituteId, activeClassId, subjectId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadAll(); } finally { setRefreshing(false); }
  };

  const countMap: Record<SubjectTab, number> = {
    videos: videos.length,
    exams: exams.length,
    assignments: assignments.length,
    materials: materials.length,
    galleries: galleries.length,
  };

  const totalCount = Object.values(countMap).reduce((a, b) => a + b, 0);
  // Teachers differ per content item; pick the first available teacher_name
  // across all loaded lists so the subtitle reads "N عنصر · أ. <name>".
  const primaryTeacher = useMemo(() => {
    const pool = [...videos, ...exams, ...assignments, ...materials, ...galleries];
    for (const it of pool) {
      const n = it?.teacher_name || it?.users?.full_name || it?.teacher?.full_name;
      if (n) return String(n);
    }
    return '';
  }, [videos, exams, assignments, materials, galleries]);

  const subtitle = primaryTeacher
    ? `${totalCount} عنصر · أ. ${primaryTeacher}`
    : `${totalCount} عنصر`;

  const renderVideo = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => { haptics.selection(); router.push({ pathname: '/(student)/content', params: { openVideoId: item.id } } as any); }}
      activeOpacity={0.85}
    >
      <View style={[s.iconChip, { backgroundColor: tokens.color.dangerBg }]}>
        <Ionicons name="play-circle" size={24} color={tokens.color.danger} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.cardSub}>{new Date(item.created_at).toLocaleDateString('ar-IQ')}</Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
    </TouchableOpacity>
  );

  const renderExam = ({ item }: { item: any }) => {
    const ses = item.session;
    const graded = !!ses?.grade_published_at;
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => { haptics.selection(); router.push({ pathname: '/(student)/exams', params: { openExamId: item.id } } as any); }}
        activeOpacity={0.85}
      >
        <View style={[s.iconChip, { backgroundColor: tokens.color.purpleBg }]}>
          <Ionicons name="document-text" size={22} color={tokens.color.purple} />
        </View>
        <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
          <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={s.cardSub}>{item.duration_minutes} د · {item.total_points} نقطة</Text>
        </View>
        {graded ? (
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: tokens.radius.sm, backgroundColor: tokens.color.successBg }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: tokens.color.success }}>{ses.score}/{ses.max_score}</Text>
          </View>
        ) : (
          <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
        )}
      </TouchableOpacity>
    );
  };

  const renderAssignment = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => { haptics.selection(); router.push({ pathname: '/(student)/assignments', params: { openAssignmentId: item.id } } as any); }}
      activeOpacity={0.85}
    >
      <View style={[s.iconChip, { backgroundColor: tokens.color.infoBg }]}>
        <Ionicons name="book" size={22} color={tokens.color.info} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.cardSub}>{item.due_date ? `الموعد: ${new Date(item.due_date).toLocaleDateString('ar-IQ')}` : 'بلا موعد'}</Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
    </TouchableOpacity>
  );

  const renderMaterial = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => { haptics.selection(); router.push({ pathname: '/(student)/content', params: { openMaterialId: item.id } } as any); }}
      activeOpacity={0.85}
    >
      <View style={[s.iconChip, { backgroundColor: tokens.color.warningBg }]}>
        <Ionicons name={item.type === 'pdf' ? 'document-attach' : 'storefront'} size={22} color={tokens.color.warning} />
      </View>
      <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.cardSub}>{item.price ? `${item.price} د.ع` : 'مجاني'}</Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
    </TouchableOpacity>
  );

  const renderGallery = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => { haptics.selection(); router.push({ pathname: '/(student)/content', params: { openGalleryId: item.id } } as any); }}
      activeOpacity={0.85}
    >
      {item.images?.[0] ? (
        <Image
          source={{ uri: item.images[0] }}
          style={{ width: 44, height: 44, borderRadius: tokens.radius.md }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
        />
      ) : (
        <View style={[s.iconChip, { backgroundColor: tokens.color.pinkBg }]}>
          <Ionicons name="images" size={22} color={tokens.color.pink} />
        </View>
      )}
      <View style={{ flex: 1, marginHorizontal: 10, alignItems: 'flex-end' }}>
        <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={s.cardSub}>{item.image_count || item.images?.length || 0} صورة</Text>
      </View>
      <Ionicons name="chevron-back" size={18} color={tokens.color.text3} />
    </TouchableOpacity>
  );

  const currentData =
    activeTab === 'videos' ? videos :
    activeTab === 'exams' ? exams :
    activeTab === 'assignments' ? assignments :
    activeTab === 'materials' ? materials : galleries;

  const currentRender =
    activeTab === 'videos' ? renderVideo :
    activeTab === 'exams' ? renderExam :
    activeTab === 'assignments' ? renderAssignment :
    activeTab === 'materials' ? renderMaterial : renderGallery;

  const emptyLabel: Record<SubjectTab, string> = {
    videos: 'لا توجد فيديوهات لهذه المادة',
    exams: 'لا توجد امتحانات لهذه المادة',
    assignments: 'لا توجد واجبات لهذه المادة',
    materials: 'لا توجد ملازم لهذه المادة',
    galleries: 'لا توجد صور لهذه المادة',
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={subjectName}
        subtitle={subtitle}
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
        fallbackRoute="/(student)/content"
      />

      <View style={s.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}
        >
          {TAB_META.map(tab => (
            <FilterChip
              key={tab.key}
              label={tab.label}
              count={countMap[tab.key]}
              active={activeTab === tab.key}
              accent="student"
              onPress={() => setActiveTab(tab.key)}
            />
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={tokens.color.teal600} />
      ) : currentData.length === 0 ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
        >
          <View style={[s.emptyChip, { backgroundColor: tokens.color.tealBg }]}>
            <Ionicons name="folder-open-outline" size={28} color={tokens.color.teal600} />
          </View>
          <Text style={s.emptyTitle}>{emptyLabel[activeTab]}</Text>
          <Text style={s.emptyDesc}>سيظهر المحتوى هنا حال إضافته من الأستاذ.</Text>
        </ScrollView>
      ) : (
        <FlashList
          data={currentData}
          keyExtractor={(item: any) => item.id}
          renderItem={currentRender}
          contentContainerStyle={{ padding: 14, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={tokens.color.teal600} />}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  tabsWrap: {
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    padding: 12,
    borderRadius: tokens.radius.lg,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  iconChip: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },
  cardSub: {
    fontSize: 11,
    color: tokens.color.text3,
    textAlign: 'right',
    marginTop: 3,
  },
  emptyChip: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12,
    color: tokens.color.text3,
    textAlign: 'center',
    marginTop: 6,
  },
});
