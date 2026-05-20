import React from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './styles';

type Filter = 'all' | 'draft' | 'published';

interface Props {
  totalCount: number;
  filter: Filter;
  onFilterChange: (f: Filter) => void;
  search: string;
  onSearchChange: (v: string) => void;
  showSearch: boolean;
}

export default function LessonsToolbar({
  totalCount,
  filter,
  onFilterChange,
  search,
  onSearchChange,
  showSearch,
}: Props) {
  return (
    <>
      {/* Saved lessons — toolbar */}
      <View style={styles.savedHeader}>
        <Text style={styles.sectionTitle}>دروسي المحفوظة</Text>
        <Text style={styles.count}>{totalCount}</Text>
      </View>

      <View style={styles.filterRow}>
        {(['all', 'draft', 'published'] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => onFilterChange(f)}
          >
            <Text style={[styles.filterChipText, filter === f && { color: '#fff' }]}>
              {f === 'all' ? 'الكل' : f === 'draft' ? 'مسودّة' : 'منشورة'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {showSearch && (
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="بحث بعنوان الدرس..."
            placeholderTextColor={Colors.textMuted}
            value={search}
            onChangeText={onSearchChange}
            textAlign="right"
          />
        </View>
      )}
    </>
  );
}
