// White card with violet outline that opens the parent medical screen (brief §7.1).
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

interface Props {
  bloodType?: string | null;
  chronic?: string | null;
  onPress: () => void;
}

function MedicalTapCard({ bloodType, chronic, onPress }: Props) {
  const { t } = useTranslation();
  const press = useSpringPress(0.97);

  const handlePress = useCallback(() => {
    haptics.selection();
    onPress();
  }, [onPress]);

  const hasRecord = Boolean(bloodType || chronic);

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={handlePress}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={t('parent.medicalRecord', { defaultValue: 'السجل الطبي' })}
      >
        <View style={styles.headerRow}>
          <Ionicons name="chevron-back" size={16} color={tokens.color.text3} />
          <View style={styles.headerInner}>
            <Ionicons name="medkit" size={20} color={tokens.color.medical} />
            <Text style={styles.title}>
              {t('parent.medicalRecord', { defaultValue: 'السجل الطبي' })}
            </Text>
          </View>
        </View>

        {!hasRecord ? (
          <Text style={styles.empty}>
            {t('parent.noMedicalRecordShort', { defaultValue: 'لا يوجد سجل طبي مسجل' })}
          </Text>
        ) : (
          <View style={styles.body}>
            {bloodType ? (
              <View style={styles.row}>
                <Text style={styles.value}>{bloodType}</Text>
                <Text style={styles.label}>
                  {t('parent.bloodTypeLabel', { defaultValue: 'فصيلة الدم' })}
                </Text>
              </View>
            ) : null}
            {chronic ? (
              <View style={styles.alert}>
                <Ionicons name="alert-circle" size={14} color={tokens.color.danger} />
                <Text style={styles.alertText} numberOfLines={2}>{chronic}</Text>
              </View>
            ) : null}
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
    borderWidth: 1,
    borderColor: tokens.color.p100,
    ...tokens.shadow.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing[3],
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'right',
  },
  body: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  value: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.black,
    color: tokens.color.medical,
  },
  label: {
    fontSize: tokens.font.size.base,
    color: tokens.color.text2,
    fontWeight: tokens.font.weight.semi,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    backgroundColor: tokens.color.dangerBg,
    borderRadius: tokens.radius.sm,
    padding: 8,
  },
  alertText: {
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.bold,
    color: tokens.color.m800,
    flexShrink: 1,
    textAlign: 'right',
  },
  empty: {
    fontSize: tokens.font.size.md,
    color: tokens.color.text3,
    textAlign: 'right',
    paddingVertical: tokens.spacing[2],
  },
});

export default memo(MedicalTapCard);
