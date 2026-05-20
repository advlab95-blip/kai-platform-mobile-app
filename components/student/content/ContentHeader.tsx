// ContentHeader — student educational-content hero + subject filter pills + sub-tabs strip.
// Pure presentational. Parent owns activeTab/selectedSubjectIds/showOtherSubject and toggle handlers.

import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import SubjectChip from '../chips/SubjectChip';
import FilterChip from '../../teacher/chips/FilterChip';

export type ContentTab = 'videos' | 'live' | 'gallery' | 'materials';

type Subject = { id: string; name: string };

type TabDef = {
  key: ContentTab;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type Props = {
  subjects: Subject[];
  selectedSubjectIds: string[];
  showOtherSubject: boolean;
  onClearFilter: () => void;
  onToggleSubject: (id: string) => void;
  onToggleOther: () => void;
  tabs: TabDef[];
  activeTab: ContentTab;
  onTabPress: (tab: ContentTab) => void;
};

export default function ContentHeader({
  subjects,
  selectedSubjectIds,
  showOtherSubject,
  onClearFilter,
  onToggleSubject,
  onToggleOther,
  tabs,
  activeTab,
  onTabPress,
}: Props) {
  const filterCount = selectedSubjectIds.length + (showOtherSubject ? 1 : 0);
  const filterLabel = filterCount > 0 ? `${filterCount} مادة` : 'كل المواد';

  return (
    <>
      {/* Subject filter pills — multi-select using SubjectChip */}
      {subjects.length > 0 && (
        <View style={styles.filterBlock}>
          <View style={styles.filterHeaderRow}>
            <View style={styles.filterTitleWrap}>
              <Ionicons name="filter" size={14} color={tokens.color.teal600} />
              <Text style={styles.filterTitle}>فلترة حسب المادة</Text>
            </View>
            <View style={styles.filterCountChip}>
              <Text style={styles.filterCountText}>{filterLabel}</Text>
            </View>
            {filterCount > 0 && (
              <TouchableOpacity
                onPress={() => { haptics.light(); onClearFilter(); }}
                style={styles.clearFilterBtn}
                activeOpacity={0.85}
              >
                <Ionicons name="close" size={12} color={tokens.color.text2} />
                <Text style={styles.clearFilterText}>إلغاء</Text>
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipStrip}>
            {subjects.map(sub => (
              <SubjectChip
                key={sub.id}
                label={sub.name}
                active={selectedSubjectIds.includes(sub.id)}
                onPress={() => onToggleSubject(sub.id)}
              />
            ))}
            <SubjectChip
              label="أخرى"
              active={showOtherSubject}
              onPress={() => { haptics.selection(); onToggleOther(); }}
            />
          </ScrollView>
        </View>
      )}

      {/* Sub-tabs — using FilterChip with student accent. Sticky-ish strip. */}
      <View style={styles.tabsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabContainer}
        >
          {tabs.map((tab) => (
            <FilterChip
              key={tab.key}
              label={tab.label}
              active={activeTab === tab.key}
              accent="student"
              onPress={() => onTabPress(tab.key)}
            />
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  // Hero header — teal student gradient
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: tokens.radius['2xl'],
    borderBottomRightRadius: tokens.radius['2xl'],
    ...tokens.shadow.teal,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'right',
    marginTop: 4,
    writingDirection: 'rtl',
  },
  // Filter block
  filterBlock: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  filterTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  filterTitle: {
    fontSize: tokens.font.size.base,
    fontWeight: '800',
    color: tokens.color.text,
  },
  filterCountChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    backgroundColor: tokens.color.brand100,
  },
  clearFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: tokens.radius.sm,
    backgroundColor: tokens.color.surface2,
  },
  clearFilterText: {
    fontSize: 11,
    fontWeight: '800',
    color: tokens.color.text2,
  },
  filterCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: tokens.color.teal600,
  },
  chipStrip: {
    gap: 8,
    alignItems: 'center',
    paddingVertical: 4,
  },
  // Tabs
  tabsWrap: {
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
    marginTop: 6,
    marginBottom: 12,
  },
  tabContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignItems: 'center',
  },
});
