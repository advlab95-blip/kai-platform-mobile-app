import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './_styles';

export type RoleFilter = 'all' | 'student' | 'teacher' | 'parent';

type ClassOpt = { id: string; name: string };

type Props = {
  searchQuery: string;
  onChangeSearch: (s: string) => void;
  searchPlaceholder: string;

  filterRole: RoleFilter;
  onChangeFilterRole: (r: RoleFilter) => void;

  filterClassId: string;
  onChangeFilterClassId: (id: string) => void;

  filterSectionId: string;
  onChangeFilterSectionId: (id: string) => void;

  availableClasses: ClassOpt[];
  availableSections: ClassOpt[];
};

// Search input + role/class/section filter chip rows. Behavior is identical
// to the inline implementation — when the role changes, class & section are
// cleared; when the class changes, the section is cleared.
export default function UsersFilterBar({
  searchQuery,
  onChangeSearch,
  searchPlaceholder,
  filterRole,
  onChangeFilterRole,
  filterClassId,
  onChangeFilterClassId,
  filterSectionId,
  onChangeFilterSectionId,
  availableClasses,
  availableSections,
}: Props) {
  return (
    <>
      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={searchPlaceholder}
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={onChangeSearch}
          textAlign="right"
        />
      </View>

      {/* Role/Class/Section filters */}
      <View style={styles.filterBlock}>
        <Text style={styles.filterLabel}>الدور:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {([
            { k: 'all', label: 'الكل' },
            { k: 'student', label: 'طلاب' },
            { k: 'teacher', label: 'أساتذة' },
            { k: 'parent', label: 'أولياء' },
          ] as const).map(opt => (
            <TouchableOpacity
              key={opt.k}
              onPress={() => {
                onChangeFilterRole(opt.k as RoleFilter);
                onChangeFilterClassId('');
                onChangeFilterSectionId('');
              }}
              style={[styles.buFilterChip, filterRole === opt.k && styles.buFilterChipActive]}
            >
              <Text style={[styles.buFilterChipText, filterRole === opt.k && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filterRole === 'student' && availableClasses.length > 0 && (
          <>
            <Text style={styles.filterLabel}>الصف:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <TouchableOpacity
                onPress={() => { onChangeFilterClassId(''); onChangeFilterSectionId(''); }}
                style={[styles.buFilterChip, !filterClassId && styles.buFilterChipActive]}
              >
                <Text style={[styles.buFilterChipText, !filterClassId && { color: '#fff' }]}>الكل</Text>
              </TouchableOpacity>
              {availableClasses.map(c => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => { onChangeFilterClassId(c.id); onChangeFilterSectionId(''); }}
                  style={[styles.buFilterChip, filterClassId === c.id && styles.buFilterChipActive]}
                >
                  <Text style={[styles.buFilterChipText, filterClassId === c.id && { color: '#fff' }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {filterRole === 'student' && filterClassId && availableSections.length > 0 && (
          <>
            <Text style={styles.filterLabel}>الشعبة:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              <TouchableOpacity
                onPress={() => onChangeFilterSectionId('')}
                style={[styles.buFilterChip, !filterSectionId && styles.buFilterChipActive]}
              >
                <Text style={[styles.buFilterChipText, !filterSectionId && { color: '#fff' }]}>الكل</Text>
              </TouchableOpacity>
              {availableSections.map(sec => (
                <TouchableOpacity
                  key={sec.id}
                  onPress={() => onChangeFilterSectionId(sec.id)}
                  style={[styles.buFilterChip, filterSectionId === sec.id && styles.buFilterChipActive]}
                >
                  <Text style={[styles.buFilterChipText, filterSectionId === sec.id && { color: '#fff' }]}>{sec.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}
      </View>
    </>
  );
}
