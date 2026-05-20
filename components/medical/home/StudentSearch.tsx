// Search input + dropdown of results.
// IMPORTANT: preserves the exact ≥2-char threshold + clear-results behavior of the
// original screen. Supabase call (searchStudents) is delegated to the parent so the
// store-action signature stays unchanged.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

interface ResultStudent {
  id: string;
  full_name: string;
}

interface Props {
  query: string;
  onChangeQuery: (text: string) => void;
  searchResults: ResultStudent[];
  onSelectResult: (student: ResultStudent) => void;
}

function StudentSearch({ query, onChangeQuery, searchResults, onSelectResult }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <View style={styles.inputWrap}>
        <Ionicons name="search" size={18} color={tokens.color.text3} />
        <TextInput
          style={styles.input}
          placeholder={t('medical.searchStudent')}
          placeholderTextColor={tokens.color.text3}
          value={query}
          onChangeText={onChangeQuery}
          textAlign="right"
          accessibilityLabel={t('medical.searchStudent')}
        />
      </View>

      {searchResults.length > 0 ? (
        <View style={styles.results}>
          {searchResults.map((student) => (
            <TouchableOpacity
              key={student.id}
              style={styles.resultItem}
              onPress={() => onSelectResult(student)}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={16} color={tokens.color.text3} />
              <Text style={styles.resultName} numberOfLines={1}>
                {student.full_name}
              </Text>
              <View style={styles.resultIcon}>
                <Ionicons name="person" size={16} color={tokens.color.m600} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: tokens.spacing[3],
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.semi,
    color: tokens.color.text,
  },
  results: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: tokens.spacing[4],
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border2,
  },
  resultName: {
    flex: 1,
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.text,
    textAlign: 'right',
    marginHorizontal: 10,
  },
  resultIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: tokens.color.m100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default memo(StudentSearch);
