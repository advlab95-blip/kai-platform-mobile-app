// AttendanceCTA — student home attendance call-to-action.
// Behavior is fully driven by feature flags set by the platform admin:
//   - attendance_qr enabled    → render QR scan button (institute use case)
//   - device_attendance enabled → render passive info card "fingerprint device" (school use case)
//   - both enabled              → QR takes precedence (active action wins over info)
//   - neither enabled           → render nothing (attendance handled silently elsewhere)
//
// The attendance numbers shown to the student/parent in stats screens come from
// the unified `attendance` table — both QR scans and device logs flow into it.
// This component only governs the input affordance, not the data.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { useFeatureFlag } from '../../../hooks/useFeatureFlag';
import { haptics } from '../../../utils/haptics';

type Props = {
  onScanPress: () => void;
  onFingerprintPress?: () => void;
};

export default function AttendanceCTA({ onScanPress, onFingerprintPress }: Props) {
  const { t } = useTranslation();
  const isQREnabled = useFeatureFlag('attendance_qr');
  const isDeviceEnabled = useFeatureFlag('device_attendance');

  if (isQREnabled) {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => { haptics.light(); onScanPress(); }}
        style={styles.qrWrap}
      >
        <LinearGradient
          colors={tokens.gradient.student as unknown as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.qrButton}
        >
          <Ionicons name="scan-outline" size={28} color="#fff" />
          <Text style={styles.qrText}>{t('student.registerAttendance')}</Text>
          <View style={styles.qrIconBg} pointerEvents="none">
            <Ionicons name="qr-code" size={50} color="rgba(255,255,255,0.06)" />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (isDeviceEnabled) {
    const card = (
      <>
        <View style={styles.fingerprintIconWrap}>
          <Ionicons name="finger-print" size={28} color={tokens.color.success} />
        </View>
        <View style={styles.fingerprintBody}>
          <Text style={styles.fingerprintTitle}>
            {t('student.fingerprintAttendanceTitle', { defaultValue: 'حضورك يُسجَّل بالبصمة' })}
          </Text>
          <Text style={styles.fingerprintHint}>
            {t('student.fingerprintAttendanceHint', {
              defaultValue: 'اسحب بصمتك على جهاز الحضور — اضغط لعرض سجلك',
            })}
          </Text>
        </View>
        {onFingerprintPress ? (
          <Ionicons
            name="chevron-back"
            size={20}
            color={tokens.color.success}
            style={styles.fingerprintChevron}
          />
        ) : null}
      </>
    );

    if (onFingerprintPress) {
      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { haptics.light(); onFingerprintPress(); }}
          style={styles.fingerprintCard}
        >
          {card}
        </TouchableOpacity>
      );
    }

    return <View style={styles.fingerprintCard}>{card}</View>;
  }

  return null;
}

const styles = StyleSheet.create({
  qrWrap: {
    marginTop: tokens.spacing[2],
    // Match fingerprint card spacing — keeps 24px breathing room below so the
    // CTA never feels glued to whatever section renders next (announcements / schedule).
    marginBottom: tokens.spacing[6],
    borderRadius: tokens.radius.xl,
    overflow: 'hidden',
    ...tokens.shadow.teal,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing[3],
    paddingVertical: 18,
    paddingHorizontal: tokens.spacing[5],
    position: 'relative',
  },
  qrText: {
    color: '#fff',
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.bold,
  },
  qrIconBg: {
    position: 'absolute',
    end: 12,
    top: 4,
  },
  fingerprintCard: {
    // Extra bottom spacing so the card isn't visually glued to the schedule
    // button beneath it. The user reported the previous 16px gap felt "stuck"
    // (`ملتصق بالأزرار التحته`). Bumped to 24px (spacing[6]).
    marginTop: tokens.spacing[2],
    marginBottom: tokens.spacing[6],
    backgroundColor: tokens.color.successBg,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[4],
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing[3],
    borderWidth: 1,
    borderColor: 'rgba(5, 150, 105, 0.15)',
  },
  fingerprintIconWrap: {
    width: 52,
    height: 52,
    borderRadius: tokens.radius.lg,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...tokens.shadow.xs,
  },
  fingerprintBody: {
    flex: 1,
  },
  fingerprintTitle: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.success,
    marginBottom: 2,
    textAlign: 'right',
  },
  fingerprintHint: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text2,
    textAlign: 'right',
  },
  fingerprintChevron: {
    marginStart: 4,
    opacity: 0.7,
  },
});
