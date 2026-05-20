// StudentsListCard — searchable preview of the institute's students (first 20).
// Pure presentational; parent owns the students array, search state, and labels.

import React from 'react';
import { View, Text, StyleSheet, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';

type Props = {
  students: any[];
  filteredStudents: any[];
  searchQuery: string;
  onChangeSearch: (v: string) => void;
  titleLabel: string;
  searchPlaceholder: string;
  emptyLabel: string;
  studentRoleLabel: string;
};

export default function StudentsListCard({
  students,
  filteredStudents,
  searchQuery,
  onChangeSearch,
  titleLabel,
  searchPlaceholder,
  emptyLabel,
  studentRoleLabel,
}: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <Ionicons name="people" size={20} color={Colors.primary} />
        <Text style={styles.cardTitle}>{titleLabel}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{students.length}</Text>
        </View>
      </View>
      <TextInput
        style={styles.searchInput}
        placeholder={searchPlaceholder}
        placeholderTextColor={Colors.textMuted}
        value={searchQuery}
        onChangeText={onChangeSearch}
        textAlign="right"
      />
      {filteredStudents.length === 0 ? (
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      ) : (
        <FlashList
          data={filteredStudents.slice(0, 20)}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          renderItem={({ item, index }) => (
            <View style={[styles.studentRow, index < filteredStudents.length - 1 && styles.studentRowBorder]}>
              <View style={styles.studentAvatar}>
                <Text style={styles.studentAvatarText}>
                  {(item.full_name || '?')[0]}
                </Text>
              </View>
              <View style={styles.studentInfo}>
                <Text style={styles.studentName}>{item.full_name}</Text>
                <Text style={styles.studentSub}>{studentRoleLabel}</Text>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  searchInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  countBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: 'auto',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  studentRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primary,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
  },
  studentSub: {
    fontSize: 10,
    color: Colors.textMuted,
    fontWeight: '600',
    textAlign: 'right',
  },
});
