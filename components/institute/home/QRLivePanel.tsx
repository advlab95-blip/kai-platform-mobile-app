// QRLivePanel — live QR token display with pulsing animation, stats row, and today's attendance log.
// Parent owns the QR session state, animation value, and the log refresh handler.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/theme';

type Props = {
  qrToken: string;
  qrRemainingSec: number;
  qrPulse: Animated.Value;
  scannedCount: number;
  attendanceLog: any[];
  loadingAttendance: boolean;
  onRefreshLog: () => void;
};

export default function QRLivePanel({
  qrToken,
  qrRemainingSec,
  qrPulse,
  scannedCount,
  attendanceLog,
  loadingAttendance,
  onRefreshLog,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.qrLivePanel}>
      <Animated.View style={[styles.qrCodeBox, { transform: [{ scale: qrPulse }] }]}>
        <LinearGradient colors={tokens.broadcastGradient} style={styles.qrCodeInner}>
          <Ionicons name="qr-code" size={80} color="#fff" />
          <Text style={styles.qrTokenText}>{qrToken.slice(0, 12)}...</Text>
          {qrRemainingSec > 0 && (
            <Text style={styles.qrCountdown}>
              {Math.floor(qrRemainingSec / 60)}:{String(qrRemainingSec % 60).padStart(2, '0')}
            </Text>
          )}
        </LinearGradient>
      </Animated.View>

      <View style={styles.qrStatsRow}>
        <View style={styles.qrStatItem}>
          <Ionicons name="scan" size={18} color={tokens.semantic.success} />
          <Text style={styles.qrStatValue}>{scannedCount}</Text>
          <Text style={styles.qrStatLabel}>{t('institute.scanned')}</Text>
        </View>
        <View style={styles.qrStatItem}>
          <Ionicons name="time" size={18} color={tokens.semantic.warning} />
          <Text style={styles.qrStatValue}>{t('institute.open')}</Text>
          <Text style={styles.qrStatLabel}>{t('institute.status')}</Text>
        </View>
      </View>

      <View style={styles.attendanceLogSection}>
        <View style={styles.attendanceLogHeader}>
          <TouchableOpacity onPress={onRefreshLog} disabled={loadingAttendance}>
            {loadingAttendance ? (
              <ActivityIndicator size="small" color={tokens.brand[500]} />
            ) : (
              <Ionicons name="refresh" size={18} color={tokens.brand[500]} />
            )}
          </TouchableOpacity>
          <Text style={styles.attendanceLogTitle}>{t('institute.todayAttendanceLog')}</Text>
        </View>
        {attendanceLog.length === 0 ? (
          <Text style={styles.emptyText}>{t('institute.noAttendanceToday')}</Text>
        ) : (
          attendanceLog.slice(0, 15).map((entry: any, idx: number) => (
            <View key={entry.id || idx} style={styles.attendanceLogRow}>
              <Text style={styles.attendanceLogTime}>
                {new Date(entry.scanned_at).toLocaleTimeString('ar-IQ', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.attendanceLogName}>{entry.student_name || 'طالب'}</Text>
              </View>
              <View style={styles.attendanceLogDot} />
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  qrLivePanel: {
    marginTop: 14,
    backgroundColor: tokens.surface.surface,
    borderRadius: tokens.radius.xl,
    borderWidth: 1,
    borderColor: tokens.border[2],
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    ...tokens.shadow.xs,
  },
  qrCodeBox: {
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: tokens.brand[500],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  qrCodeInner: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  qrTokenText: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '600',
    marginTop: 8,
    fontFamily: 'monospace',
  },
  qrCountdown: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 8,
    fontWeight: '700',
  },
  qrStatsRow: {
    flexDirection: 'row',
    gap: 30,
    marginTop: 16,
  },
  qrStatItem: {
    alignItems: 'center',
    gap: 4,
  },
  qrStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.text[1],
  },
  qrStatLabel: {
    fontSize: 10,
    color: tokens.text[3],
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: tokens.text[3],
    textAlign: 'center',
    paddingVertical: 20,
  },
  attendanceLogSection: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: tokens.border[2],
    paddingTop: 12,
    width: '100%',
  },
  attendanceLogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  attendanceLogTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.text[1],
  },
  attendanceLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: tokens.border[2],
    gap: 8,
  },
  attendanceLogName: {
    fontSize: 12,
    fontWeight: '700',
    color: tokens.text[1],
    textAlign: 'right',
  },
  attendanceLogTime: {
    fontSize: 10,
    fontWeight: '600',
    color: tokens.text[3],
  },
  attendanceLogDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: tokens.semantic.success,
  },
});
