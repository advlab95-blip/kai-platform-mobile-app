// QuickActionsGrid — BroadcastCard + 4 QuickActionCards (QR, classes, users, year).
// Parent owns: feature flag value, qrOpen state, scanned count, current year label, all press handlers.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/theme';
import BroadcastCard from '../BroadcastCard';
import QuickActionCard from '../QuickActionCard';

type Props = {
  isQREnabled: boolean;
  qrOpen: boolean;
  scannedCount: number;
  totalUsers: number;
  subjectsCount?: number;
  currentYearName?: string | null;
  onBroadcastPress: () => void;
  onQRTogglePress: () => void;
  onClassesPress: () => void;
  onUsersPress: () => void;
  onYearPress: () => void;
  onSubjectsPress?: () => void;
};

export default function QuickActionsGrid({
  isQREnabled,
  qrOpen,
  scannedCount,
  totalUsers,
  subjectsCount,
  currentYearName,
  onBroadcastPress,
  onQRTogglePress,
  onClassesPress,
  onUsersPress,
  onYearPress,
  onSubjectsPress,
}: Props) {
  const { t } = useTranslation();

  return (
    <>
      <BroadcastCard
        title="مركز المراسلة"
        sub="إعلان · تبليغ · محادثة — كلها من هنا"
        icon="megaphone"
        onPress={onBroadcastPress}
        delay={0}
      />

      <View style={styles.quickGrid}>
        {isQREnabled && (
          <QuickActionCard
            icon={qrOpen ? 'close-circle' : 'qr-code'}
            iconBg={tokens.semantic.successBg}
            iconColor={tokens.semantic.success}
            title={qrOpen ? t('institute.closeAttendance') : 'الحضور QR'}
            sub={qrOpen ? `${scannedCount} طالب حاضر` : 'جلسة حضور مباشرة'}
            active={qrOpen}
            onPress={onQRTogglePress}
            delay={60}
          />
        )}
        <QuickActionCard
          icon="grid"
          iconBg={tokens.brand[100]}
          iconColor={tokens.brand[500]}
          title={t('institute.manageClasses')}
          sub={t('institute.manageClassesDesc')}
          onPress={onClassesPress}
          delay={120}
        />
        <QuickActionCard
          icon="people"
          iconBg={tokens.semantic.infoBg}
          iconColor={tokens.semantic.info}
          title="المستخدمون"
          sub={`${totalUsers} حساب`}
          onPress={onUsersPress}
          delay={180}
        />
        <QuickActionCard
          icon="calendar"
          iconBg={tokens.semantic.purpleBg}
          iconColor={tokens.semantic.purple}
          title={t('institute.academicYearLabel')}
          sub={currentYearName || t('institute.academicYearNotSet')}
          onPress={onYearPress}
          delay={240}
        />
        {onSubjectsPress && (
          <QuickActionCard
            icon="book"
            iconBg={tokens.semantic.warningBg}
            iconColor={tokens.semantic.warning}
            title="المواد الدراسية"
            sub={subjectsCount != null ? `${subjectsCount} مادة مسجّلة` : 'إضافة وإدارة المواد'}
            onPress={onSubjectsPress}
            delay={300}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 4,
  },
});
