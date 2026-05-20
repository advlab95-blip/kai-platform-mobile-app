// LegacyClassSubjectSelectors — horizontal class chips (only when targets is empty,
// i.e. teacher has no teacher_assignments yet) and subject chips. Both are kept
// as a fallback for legacy teacher accounts.

import React from 'react';
import { Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';

type Props = {
  targetsLength: number;
  classes: any[];
  selectedClass: any;
  onSelectClass: (cls: any) => void;
  subjects: any[];
  selectedSubject: any;
  onSelectSubject: (sub: any | null) => void;
};

export default function LegacyClassSubjectSelectors({
  targetsLength,
  classes,
  selectedClass,
  onSelectClass,
  subjects,
  selectedSubject,
  onSelectSubject,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      {/* Legacy class selector — kept for teachers without teacher_assignments configured */}
      {targetsLength === 0 && classes.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('teacherHome.classes')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
            {classes.map((cls: any) => (
              <TouchableOpacity
                key={cls.id}
                onPress={() => onSelectClass(cls)}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={selectedClass?.id === cls.id ? ['#1D4ED8', '#3B82F6'] : ['#64748B', '#94A3B8']}
                  style={styles.classCard}
                >
                  <Text style={styles.className}>{cls.name || t('common.class')}</Text>
                  <Text style={styles.classStudentCount}>{cls.student_count || 0} {t('roles.student')}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}

      {/* Subject Selector */}
      {subjects.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('teacherHome.subjects')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classScroll}>
            <TouchableOpacity onPress={() => onSelectSubject(null)} activeOpacity={0.8}>
              <LinearGradient
                colors={!selectedSubject ? ([...tokens.gradient.purple] as any) : ['#64748B', '#94A3B8']}
                style={styles.classCard}
              >
                <Text style={styles.className}>{t('common.all')}</Text>
              </LinearGradient>
            </TouchableOpacity>
            {subjects.map((sub: any) => (
              <TouchableOpacity key={sub.id} onPress={() => onSelectSubject(sub)} activeOpacity={0.8}>
                <LinearGradient
                  colors={selectedSubject?.id === sub.id ? ([...tokens.gradient.purple] as any) : ['#64748B', '#94A3B8']}
                  style={styles.classCard}
                >
                  <Text style={styles.className}>{sub.name}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  classScroll: {
    marginBottom: 16,
  },
  classCard: {
    borderRadius: 16,
    padding: 14,
    marginLeft: 10,
    minWidth: 120,
    alignItems: 'center',
  },
  className: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
  },
  classStudentCount: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
});
