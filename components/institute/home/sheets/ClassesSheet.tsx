// ClassesSheet — wizard for organizing classes by stage (primary/middle/secondary).
// Pure presentational; parent owns all state (classes, selection, language, name) and Supabase handlers.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';

type Stage = {
  key: string;
  label: string;
  color: string;
  grades: string[];
  branches?: string[];
};

const STAGES: Stage[] = [
  { key: 'primary', label: 'الابتدائية', color: '#059669', grades: ['الأول', 'الثاني', 'الثالث', 'الرابع', 'الخامس', 'السادس'] },
  { key: 'middle', label: 'المتوسطة', color: '#1D4ED8', grades: ['الأول', 'الثاني', 'الثالث'] },
  { key: 'secondary', label: 'الإعدادية', color: '#7C3AED', grades: ['الرابع', 'الخامس', 'السادس'], branches: ['العلمي', 'الأدبي'] },
];
const SECTIONS_AR = ['أ', 'ب', 'ج', 'د', 'هـ', 'و'];
const SECTIONS_EN = ['A', 'B', 'C', 'D', 'E', 'F'];

type Props = {
  visible: boolean;
  onClose: () => void;
  classes: any[];
  selectedStage: string;
  sectionLang: 'ar' | 'en';
  selectedClasses: string[];
  newClassName: string;
  addingClass: boolean;
  onSelectStage: (key: string) => void;
  onSetSectionLang: (lang: 'ar' | 'en') => void;
  onToggleSelection: (fullName: string) => void;
  onSaveSelected: () => void;
  onDeleteClass: (id: string, name: string) => void;
  onChangeNewClassName: (name: string) => void;
  onAddCustomClass: () => void;
};

export default function ClassesSheet({
  visible,
  onClose,
  classes,
  selectedStage,
  sectionLang,
  selectedClasses,
  newClassName,
  addingClass,
  onSelectStage,
  onSetSectionLang,
  onToggleSelection,
  onSaveSelected,
  onDeleteClass,
  onChangeNewClassName,
  onAddCustomClass,
}: Props) {
  const { t } = useTranslation();
  const stage = STAGES.find(s => s.key === selectedStage)!;
  const sections = sectionLang === 'ar' ? SECTIONS_AR : SECTIONS_EN;

  const isSelected = (gradeName: string, section: string) => {
    const fullName = `${gradeName} ${stage.label} ${section}`;
    return selectedClasses.includes(fullName) || classes.some(c => c.name === fullName);
  };

  const existsInDB = (gradeName: string, section: string) => {
    const fullName = `${gradeName} ${stage.label} ${section}`;
    return classes.some(c => c.name === fullName);
  };

  const toggle = (gradeName: string, section: string) => {
    const fullName = `${gradeName} ${stage.label} ${section}`;
    if (classes.some(c => c.name === fullName)) return;
    onToggleSelection(fullName);
  };

  // Counts for the header summary — total classes saved + currently selected
  const stageCount = classes.filter(c => c.name.includes(stage.label)).length;
  const totalCount = classes.length;

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.8}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <View style={styles.header}>
          <View style={styles.countsRow}>
            <View style={[styles.countBadge, { backgroundColor: stage.color + '15' }]}>
              <Text style={[styles.countBadgeNum, { color: stage.color }]}>{stageCount}</Text>
              <Text style={[styles.countBadgeLabel, { color: stage.color }]}>في {stage.label}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeNum}>{totalCount}</Text>
              <Text style={styles.countBadgeLabel}>إجمالي</Text>
            </View>
          </View>
          <Text style={styles.headerTitle}>{t('institute.manageClasses')}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        <KeyboardAwareScroll
          style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 16 }}
        >
          <View style={styles.stagesRow}>
            {STAGES.map(s => (
              <TouchableOpacity
                key={s.key}
                style={{ flex: 1, backgroundColor: selectedStage === s.key ? s.color : '#F1F5F9', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
                onPress={() => onSelectStage(s.key)}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: selectedStage === s.key ? '#fff' : Colors.text }}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.langRow}>
            <TouchableOpacity
              style={{ backgroundColor: sectionLang === 'en' ? Colors.primary : '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              onPress={() => onSetSectionLang('en')}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: sectionLang === 'en' ? '#fff' : Colors.text }}>A B C</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: sectionLang === 'ar' ? Colors.primary : '#F1F5F9', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 }}
              onPress={() => onSetSectionLang('ar')}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: sectionLang === 'ar' ? '#fff' : Colors.text }}>أ ب ج</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.textMuted }}>نمط الشعب:</Text>
          </View>

          {stage.grades.map(grade => {
            const hasBranches = (stage.branches?.length ?? 0) > 0;
            const branchList: string[] = hasBranches ? (stage.branches as string[]) : [''];

            return branchList.map(branch => {
              const fullGrade = branch ? `${grade} ${branch}` : grade;
              const gradeClasses = classes.filter(c => {
                if (branch) return c.name.includes(grade) && c.name.includes(branch) && c.name.includes(stage.label);
                return c.name.includes(grade) && c.name.includes(stage.label);
              });
              const branchColor = branch === 'الأدبي' ? '#B45309' : stage.color;

              // "Select all" picks every section that's neither already in DB nor pending.
              const missingSections = sections.filter(sec => !isSelected(fullGrade, sec));
              const canSelectAll = missingSections.length > 0;

              return (
                <View key={fullGrade} style={styles.gradeBlock}>
                  <View style={[styles.gradeRow, { marginBottom: gradeClasses.length > 0 ? 10 : 0 }]}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={{ gap: 4 }}
                      style={{ flex: 1 }}
                    >
                      {canSelectAll && (
                        <TouchableOpacity
                          style={{ height: 36, borderRadius: 10, backgroundColor: `${branchColor}15`, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: `${branchColor}40`, paddingHorizontal: 8, flexDirection: 'row', gap: 3 }}
                          onPress={() => missingSections.forEach(sec => toggle(fullGrade, sec))}
                        >
                          <Ionicons name="checkmark-done" size={14} color={branchColor} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: branchColor }}>الكل</Text>
                        </TouchableOpacity>
                      )}
                      {sections.map(sec => {
                        const sel = isSelected(fullGrade, sec);
                        const inDB = existsInDB(fullGrade, sec);
                        return (
                          <TouchableOpacity
                            key={sec}
                            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: sel ? (inDB ? '#E2E8F0' : branchColor) : `${branchColor}10`, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: sel ? branchColor : `${branchColor}30` }}
                            onPress={() => toggle(fullGrade, sec)}
                            disabled={inDB}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '800', color: sel ? (inDB ? '#94A3B8' : '#fff') : branchColor }}>
                              {inDB ? '✓' : sel ? '✓' : sec}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                    <View style={{ alignItems: 'flex-end', marginStart: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: branchColor }}>{grade} {stage.label}</Text>
                      {branch ? <Text style={{ fontSize: 11, fontWeight: '700', color: branchColor, marginTop: 2 }}>{branch}</Text> : null}
                    </View>
                  </View>

                  {gradeClasses.length > 0 && (
                    <View style={styles.classesChips}>
                      {gradeClasses.map(c => (
                        <View key={c.id} style={styles.classChip}>
                          <TouchableOpacity onPress={() => onDeleteClass(c.id, c.name)}>
                            <Ionicons name="close-circle" size={16} color={Colors.error} />
                          </TouchableOpacity>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.text }}>{c.name}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            });
          })}

          {selectedClasses.length > 0 && (
            <TouchableOpacity
              style={{ backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 12, opacity: addingClass ? 0.6 : 1, flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              onPress={onSaveSelected}
              disabled={addingClass}
            >
              {addingClass ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="save" size={16} color="#fff" />
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#fff' }}>
                    {selectedClasses.length === 1
                      ? 'حفظ صف واحد'
                      : selectedClasses.length === 2
                      ? 'حفظ صفّين'
                      : selectedClasses.length <= 10
                      ? `حفظ ${selectedClasses.length} صفوف`
                      : `حفظ ${selectedClasses.length} صفاً`}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <View style={{ marginTop: 12, marginBottom: 20 }}>
            <Text style={styles.customLabel}>أو أضف صف مخصص:</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={newClassName}
                onChangeText={onChangeNewClassName}
                placeholder="اسم الصف..."
                placeholderTextColor={Colors.textMuted}
                style={styles.customInput}
              />
              <TouchableOpacity
                disabled={addingClass}
                onPress={onAddCustomClass}
                style={{ backgroundColor: addingClass ? '#CBD5E1' : Colors.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' }}
              >
                {addingClass ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={20} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAwareScroll>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  countsRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  countBadgeNum: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    fontVariant: ['tabular-nums'],
  },
  countBadgeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  stagesRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    justifyContent: 'center',
  },
  langRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  gradeBlock: {
    marginBottom: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gradeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  classesChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-end',
  },
  classChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  customLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textMuted,
    textAlign: 'right',
    marginBottom: 6,
  },
  customInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
});
