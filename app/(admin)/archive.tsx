import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import SwipeableSheet from '../../components/shared/SwipeableSheet';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import { Colors } from '../../constants/colors';
import useDataStore from '../../stores/dataStore';
import useAuthStore from '../../stores/authStore';
import { api } from '../../services/api';
import { confirmAlert, successAlert } from '../../utils/alerts';
import { useTranslation } from 'react-i18next';
import { haptics } from '../../utils/haptics';

type ContentType = 'videos' | 'materials';

export default function AdminArchive() {
  const { t } = useTranslation();
  const { institutes } = useDataStore();
  const userId = useAuthStore((s) => s.userId);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [archivedVideos, setArchivedVideos] = useState<any[]>([]);
  const [archivedMaterials, setArchivedMaterials] = useState<any[]>([]);
  const [filterInst, setFilterInst] = useState(institutes[0]?.id || '');
  const [activeTab, setActiveTab] = useState<ContentType>('videos');

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportItem, setExportItem] = useState<any>(null);
  const [exportType, setExportType] = useState<ContentType>('videos');
  const [exportTargetInst, setExportTargetInst] = useState('');
  const [exportTargetTeacher, setExportTargetTeacher] = useState('');
  const [exportTeachers, setExportTeachers] = useState<any[]>([]);
  const [exporting, setExporting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getArchivedContent(filterInst || undefined);
      setArchivedVideos(data.videos);
      setArchivedMaterials(data.materials);
    } catch (err: any) {
      if (__DEV__) console.error(err);
      Alert.alert('خطأ', err?.message || 'فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [filterInst]);

  useEffect(() => { loadData(); }, [filterInst]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }, [loadData]);

  const handleRestore = (table: ContentType, item: any) => {
    confirmAlert(t('admin.restoreContent'), t('admin.restoreQuestion', { title: item.title || t('common.content') }), async () => {
      try {
        await api.restoreFromArchive(table, item.id);
        api.logAdminAction({
          actorId: userId || '',
          actorRole: 'admin',
          action: 'archive_restore',
          targetType: 'archive_record',
          targetId: item.id,
          targetName: item.title || undefined,
          instituteId: item.institute_id || item.teacher_institute_id || undefined,
          metadata: { content_type: table },
        }).catch(() => {});
        Alert.alert(t('common.success'), t('admin.contentRestored'));
        loadData();
      } catch (err: any) { Alert.alert(t('common.error'), err.message); }
    });
  };

  const handlePermanentDelete = (table: ContentType, item: any) => {
    confirmAlert(t('common.permanentDelete'), `${t('common.delete')} "${item.title || t('common.content')}"?`, () => {
      confirmAlert(t('common.finalConfirm'), t('common.cannotUndo'), async () => {
        try {
          await api.permanentlyDeleteContent(table, item.id);
          api.logAdminAction({
            actorId: userId || '',
            actorRole: 'admin',
            action: 'archive_permanent_delete',
            targetType: 'archive_record',
            targetId: item.id,
            targetName: item.title || undefined,
            instituteId: item.institute_id || item.teacher_institute_id || undefined,
            metadata: { content_type: table },
          }).catch(() => {});
          Alert.alert(t('common.success'), t('admin.permanentlyDeleted'));
          loadData();
        } catch (err: any) { Alert.alert(t('common.error'), err.message); }
      }, true);
    }, true);
  };

  const openExport = (table: ContentType, item: any) => {
    setExportItem(item);
    setExportType(table);
    setExportTargetInst('');
    setExportTargetTeacher('');
    setExportTeachers([]);
    setShowExportModal(true);
  };

  const loadExportTeachers = async (instId: string) => {
    setExportTargetInst(instId);
    setExportTargetTeacher('');
    try {
      const teachers = await api.getTeachersByInstitute(instId);
      setExportTeachers(teachers);
    } catch { setExportTeachers([]); }
  };

  const handleExport = async () => {
    if (!exportItem || !exportTargetTeacher || !exportTargetInst) return;
    setExporting(true);
    try {
      await api.exportContentToTeacher(exportType, exportItem.id, exportTargetTeacher, exportTargetInst);
      Alert.alert(t('common.success'), t('admin.contentExported'));
      setShowExportModal(false);
    } catch (err: any) { Alert.alert(t('common.error'), err.message); } finally {
      setExporting(false);
    }
  };

  const data = activeTab === 'videos' ? archivedVideos : archivedMaterials;

  // Group by teacher
  const groupedByTeacher = data.reduce((acc: Record<string, any[]>, item: any) => {
    const teacherName = (item as any).users?.full_name || t('admin.withoutTeacher');
    if (!acc[teacherName]) acc[teacherName] = [];
    acc[teacherName].push(item);
    return acc;
  }, {});

  const getInstName = (item: any) => {
    if (item.institute_id) return institutes.find(i => i.id === item.institute_id)?.name || '';
    if (item.teacher_institute_id) return institutes.find(i => i.id === item.teacher_institute_id)?.name || '';
    return '';
  };

  const getIcon = (type: ContentType) => {
    switch (type) {
      case 'videos': return 'videocam';
      case 'materials': return 'document-text';
      default: return 'folder';
    }
  };

  const getColor = (type: ContentType) => {
    switch (type) {
      case 'videos': return { bg: '#EEF2FF', text: Colors.primary };
      case 'materials': return { bg: '#F5F3FF', text: '#7C3AED' };
      default: return { bg: '#F1F5F9', text: Colors.textMuted };
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title={t('admin.archive')}
        subtitle={t('admin.archiveDescription')}
        gradient={tokens.gradient.brand}
        glowAccent="rgba(59,130,246,0.30)"
      />

      {/* Institute filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingHorizontal: 16, marginBottom: 12, flexGrow: 0 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity style={[s.chip, !filterInst && s.chipActive]} onPress={() => setFilterInst('')}>
            <Text style={[s.chipText, !filterInst && s.chipTextActive]}>{t('admin.allInstitutes')}</Text>
          </TouchableOpacity>
          {institutes.map((inst) => (
            <TouchableOpacity key={inst.id} style={[s.chip, filterInst === inst.id && s.chipActive]} onPress={() => setFilterInst(inst.id)}>
              <Ionicons name={(inst as any).type === 'school' ? 'school' : 'business'} size={12} color={filterInst === inst.id ? Colors.primary : Colors.textMuted} />
              <Text style={[s.chipText, filterInst === inst.id && s.chipTextActive]}>{inst.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Content type tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 16 }}>
        {([
          { key: 'videos' as ContentType, label: t('admin.videos'), icon: 'videocam', count: archivedVideos.length },
          { key: 'materials' as ContentType, label: t('admin.materials'), icon: 'document-text', count: archivedMaterials.length },
        ] as const).map((tab) => (
          <TouchableOpacity key={tab.key} style={[s.tab, activeTab === tab.key && s.tabActive]} onPress={() => setActiveTab(tab.key)}>
            <Ionicons name={tab.icon as any} size={16} color={activeTab === tab.key ? '#fff' : Colors.textMuted} />
            <Text style={[s.tabText, activeTab === tab.key && s.tabTextActive]}>{tab.label} ({tab.count})</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content list grouped by teacher */}
      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ paddingTop: 40 }} />
      ) : data.length === 0 ? (
        <View style={{ alignItems: 'center', paddingTop: 60 }}>
          <Ionicons name="archive-outline" size={64} color="#E2E8F0" />
          <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.textMuted, marginTop: 16 }}>{t('admin.noArchivedContent')}</Text>
          <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 4 }}>{t('admin.deletedContentAppears')}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {Object.entries(groupedByTeacher).map(([teacherName, items]) => (
            <View key={teacherName} style={{ marginBottom: 16 }}>
              {/* Teacher header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.text }}>{teacherName}</Text>
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="person" size={14} color={Colors.primary} />
                </View>
              </View>

              {/* Items */}
              {(items as any[]).map((item: any) => {
                const color = getColor(activeTab);
                return (
                  <View key={item.id} style={s.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      {/* Actions */}
                      <View style={{ flexDirection: 'row', gap: 10, marginRight: 12 }}>
                        <TouchableOpacity onPress={() => handlePermanentDelete(activeTab, item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="trash" size={18} color={Colors.error} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => openExport(activeTab, item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="share-outline" size={18} color="#7C3AED" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleRestore(activeTab, item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="refresh" size={18} color="#059669" />
                        </TouchableOpacity>
                      </View>

                      {/* Content info */}
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.text }}>{item.title || t('common.noTitle')}</Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 2 }}>
                          {item.archived_at ? t('admin.deletedOn') + ' ' + new Date(item.archived_at).toLocaleDateString('ar-IQ') : ''}
                        </Text>
                      </View>

                      {/* Icon */}
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', marginLeft: 10 }}>
                        <Ionicons name={getIcon(activeTab) as any} size={20} color={color.text} />
                      </View>
                    </View>

                    {/* Action labels */}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#FEF2F2' }} onPress={() => handlePermanentDelete(activeTab, item)}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.error }}>{t('common.permanentDelete')}</Text>
                        <Ionicons name="trash-outline" size={12} color={Colors.error} />
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F5F3FF' }} onPress={() => openExport(activeTab, item)}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{t('common.export')}</Text>
                        <Ionicons name="share-outline" size={12} color="#7C3AED" />
                      </TouchableOpacity>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#ECFDF5' }} onPress={() => handleRestore(activeTab, item)}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#059669' }}>{t('common.restore')}</Text>
                        <Ionicons name="refresh-outline" size={12} color="#059669" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}

      {/* Export sheet */}
      <SwipeableSheet visible={showExportModal} onClose={() => setShowExportModal(false)} maxHeight={0.75}>
        <View style={{ paddingHorizontal: 24, paddingTop: 4, paddingBottom: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 4 }}>{t('admin.exportContent')}</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 16 }}>{t('admin.exportDescription')}</Text>

            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 8 }}>{t('admin.institutionSchool')}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, flexGrow: 0 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {institutes.map((inst) => (
                  <TouchableOpacity key={inst.id} style={[s.chip, exportTargetInst === inst.id && s.chipActive]} onPress={() => loadExportTeachers(inst.id)}>
                    <Text style={[s.chipText, exportTargetInst === inst.id && s.chipTextActive]}>{inst.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {exportTargetInst && (
              <>
                <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textSecondary, textAlign: 'right', marginBottom: 8 }}>{t('admin.theTeacher')}</Text>
                <ScrollView style={{ maxHeight: 150, marginBottom: 16 }}>
                  {exportTeachers.map((teacher: any) => {
                    const tid = teacher.id || teacher.user_id;
                    const tname = (teacher as any).users?.full_name || teacher.full_name || t('roles.teacher');
                    return (
                      <TouchableOpacity key={tid} style={[s.chip, { marginBottom: 6, flexDirection: 'row', gap: 6 }, exportTargetTeacher === tid && s.chipActive]} onPress={() => setExportTargetTeacher(tid)}>
                        <Ionicons name="person" size={14} color={exportTargetTeacher === tid ? Colors.primary : Colors.textMuted} />
                        <Text style={[s.chipText, exportTargetTeacher === tid && s.chipTextActive]}>{tname}</Text>
                      </TouchableOpacity>
                    );
                  })}
                  {exportTeachers.length === 0 && <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'center', padding: 20 }}>{t('admin.noTeachers')}</Text>}
                </ScrollView>
              </>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#F1F5F9', alignItems: 'center' }} onPress={() => setShowExportModal(false)}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textSecondary }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: '#7C3AED', alignItems: 'center', opacity: (!exportTargetTeacher || exporting) ? 0.4 : 1 }}
                onPress={handleExport}
                disabled={!exportTargetTeacher || exporting}
              >
                {exporting ? <ActivityIndicator color="#fff" size="small" /> : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{t('common.export')}</Text>
                    <Ionicons name="share" size={16} color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
            </View>
        </View>
      </SwipeableSheet>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textSecondary, textAlign: 'right', marginTop: 4, lineHeight: 20 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  chipActive: { backgroundColor: '#EEF2FF', borderColor: Colors.primary },
  chipText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  chipTextActive: { color: Colors.primary },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 14, backgroundColor: '#F1F5F9' },
  tabActive: { backgroundColor: Colors.primary },
  tabText: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },
  tabTextActive: { color: '#fff' },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: Colors.border },
});
