// Medical home screen — orchestration only.
// Data flow:
//   useMedicalStore (Zustand) → stats / allStudents / allRecords / searchResults
//   useDataStore.userInstituteId is the multi-tenant guard for every read.
//   Feature gate: useFeatureFlag('medical_records'). When off → <LockedScreen />.
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import useMedicalStore from '../../stores/medicalStore';
import { useProfilePic } from '../../hooks/useProfilePic';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import FadeSlideIn from '../../components/animated/FadeSlideIn';
import { haptics } from '../../utils/haptics';
import { tokens } from '../../constants/designTokens';

import HomeHero from '../../components/medical/home/HomeHero';
import StatsRow from '../../components/medical/home/StatsRow';
import StudentSearch from '../../components/medical/home/StudentSearch';
import StudentsList from '../../components/medical/home/StudentsList';
import RecentRecords from '../../components/medical/home/RecentRecords';
import Shortcuts from '../../components/medical/home/Shortcuts';
import LockedScreen from '../../components/medical/shared/LockedScreen';
import type {
  StudentRowData,
  RecordRowData,
} from '../../components/medical/cards/StudentRecordRow';

export default function MedicalHome() {
  const router = useRouter();
  const { userName, userId } = useAuthStore();
  const { avatarUrl, pickAndUploadAvatar } = useProfilePic(userId);
  const { userInstituteId } = useDataStore();
  const {
    stats,
    searchResults,
    allRecords,
    allStudents,
    searchStudents,
    selectStudent,
    loadStats,
    loadAllRecords,
    loadAllStudents,
  } = useMedicalStore();
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const isEnabled = useFeatureFlag('medical_records');

  useEffect(() => {
    if (userInstituteId) {
      loadStats(userInstituteId);
      loadAllRecords(userInstituteId);
      loadAllStudents(userInstituteId);
    }
  }, [userInstituteId]);

  const onRefresh = useCallback(async () => {
    haptics.light();
    setRefreshing(true);
    try {
      if (userInstituteId) {
        await Promise.all([
          loadStats(userInstituteId),
          loadAllRecords(userInstituteId),
          loadAllStudents(userInstituteId),
        ]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [userInstituteId]);

  const handleSearch = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (text.trim().length >= 2 && userInstituteId) {
        searchStudents(text, userInstituteId);
      } else {
        // Clear results when search text is too short (preserve original logic).
        useMedicalStore.setState({ searchResults: [] });
      }
    },
    [searchStudents, userInstituteId],
  );

  const handleSelectStudent = useCallback(
    (student: StudentRowData) => {
      if (!student.id || !student.full_name) return;
      selectStudent({ id: student.id, full_name: student.full_name });
      setSearchQuery('');
      router.push('/(medical)/records');
    },
    [router, selectStudent],
  );

  const handleSelectRecord = useCallback(
    (record: RecordRowData) => {
      if (!record.student_id) return;
      selectStudent({
        id: record.student_id,
        full_name: record.users?.full_name || 'طالب',
      });
      router.push('/(medical)/records');
    },
    [router, selectStudent],
  );

  const recentRecords = useMemo(() => allRecords.slice(0, 5), [allRecords]);

  if (!isEnabled) return <LockedScreen />;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FadeSlideIn style={styles.flex}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={tokens.color.m600}
              />
            }
          >
            <HomeHero
              userName={userName}
              avatarUrl={avatarUrl}
              onAvatarPress={pickAndUploadAvatar}
            />

            <View style={styles.content}>
              <StatsRow
                totalStudents={stats.totalStudents}
                withRecords={stats.withRecords}
              />
              <Shortcuts />
              <StudentSearch
                query={searchQuery}
                onChangeQuery={handleSearch}
                searchResults={searchResults}
                onSelectResult={handleSelectStudent}
              />
              <StudentsList students={allStudents} onSelect={handleSelectStudent} />
              <RecentRecords records={recentRecords} onSelect={handleSelectRecord} />
              <View style={styles.bottomSpacer} />
            </View>
          </ScrollView>
        </FadeSlideIn>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  flex: { flex: 1 },
  content: { paddingHorizontal: tokens.spacing[4], paddingTop: tokens.spacing[4] },
  bottomSpacer: { height: 30 },
});
