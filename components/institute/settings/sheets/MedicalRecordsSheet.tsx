// MedicalRecordsSheet — search a student then view their medical record card.
// Pure presentational; parent owns the search query, results, selection,
// and medical record loading state.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../../shared/KeyboardAwareScroll';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedStudentMedical: any;
  medicalSearchQuery: string;
  medicalSearchResults: any[];
  loadingMedical: boolean;
  medicalRecord: any;
  onSearch: (q: string) => void;
  onSelectStudent: (s: any) => void;
  onClearSelection: () => void;
  title: string;
};

export default function MedicalRecordsSheet({
  visible,
  onClose,
  selectedStudentMedical,
  medicalSearchQuery,
  medicalSearchResults,
  loadingMedical,
  medicalRecord,
  onSearch,
  onSelectStudent,
  onClearSelection,
  title,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.92}>
      <View style={styles.fullScreenContent}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
        </View>

        {!selectedStudentMedical ? (
          <>
            <TextInput
              style={styles.searchInput}
              placeholder="ابحث عن طالب بالاسم..."
              placeholderTextColor={Colors.textMuted}
              value={medicalSearchQuery}
              onChangeText={onSearch}
              textAlign="right"
            />
            {medicalSearchResults.length === 0 && medicalSearchQuery.length >= 2 ? (
              <Text style={styles.emptyText}>لا توجد نتائج</Text>
            ) : (
              <View style={{ height: SCREEN_HEIGHT * 0.6 }}>
                <FlashList
                  data={medicalSearchResults}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={{ gap: 6 }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 12, gap: 10 }}
                      onPress={() => onSelectStudent(item)}
                    >
                      <Ionicons name="chevron-back" size={16} color={Colors.textMuted} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text, textAlign: 'right' }}>
                          {item.full_name}
                        </Text>
                      </View>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name="person" size={16} color={Colors.medical} />
                      </View>
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}
          </>
        ) : (
          <KeyboardAwareScroll
            style={{ maxHeight: SCREEN_HEIGHT * 0.7 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}
              onPress={onClearSelection}
            >
              <Ionicons name="arrow-forward" size={18} color={Colors.primary} />
              <Text style={{ fontSize: 12, color: Colors.primary, fontWeight: '700' }}>رجوع</Text>
            </TouchableOpacity>

            <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 12 }}>
              {selectedStudentMedical.full_name}
            </Text>

            {loadingMedical ? (
              <ActivityIndicator size="large" color={Colors.primary} />
            ) : !medicalRecord ? (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Ionicons name="document-outline" size={48} color="#E2E8F0" />
                <Text style={{ color: Colors.textMuted, marginTop: 8 }}>لا يوجد سجل طبي لهذا الطالب</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {[
                  { label: 'فصيلة الدم', value: medicalRecord.blood_type, icon: 'water' },
                  { label: 'الأمراض المزمنة', value: medicalRecord.chronic_conditions, icon: 'heart' },
                  { label: 'الحساسية', value: medicalRecord.allergies, icon: 'alert-circle' },
                  { label: 'مستوى السكر', value: medicalRecord.sugar_level, icon: 'fitness' },
                  { label: 'ضغط الدم', value: medicalRecord.blood_pressure, icon: 'pulse' },
                  { label: 'الأسنان', value: medicalRecord.dental, icon: 'happy' },
                  { label: 'العيون', value: medicalRecord.eyes, icon: 'eye' },
                ].map((field, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, gap: 10 }}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: Colors.text }}>
                      {field.value || 'غير محدد'}
                    </Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted }}>
                      {field.label}
                    </Text>
                    <Ionicons name={field.icon as any} size={16} color={Colors.medical} />
                  </View>
                ))}
              </View>
            )}
          </KeyboardAwareScroll>
        )}
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  fullScreenContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
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
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
