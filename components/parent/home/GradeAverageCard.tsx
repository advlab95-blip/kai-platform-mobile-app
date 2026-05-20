// Tappable gradient card showing the published-grade average (brief §7.1).
// Tier color: green ≥ 70, amber ≥ 50, red < 50. Tap → /(parent)/grades.
import React, { memo, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

interface Props {
  average: number;
  count: number;
  onPress: () => void;
}

function GradeAverageCard({ average, count, onPress }: Props) {
  const { t } = useTranslation();
  const press = useSpringPress(0.97);

  const gradient =
    average >= 70 ? tokens.gradient.gradeGood :
    average >= 50 ? tokens.gradient.gradeMid :
    tokens.gradient.gradeLow;

  const handlePress = useCallback(() => {
    haptics.selection();
    onPress();
  }, [onPress]);

  return (
    <Animated.View style={{ transform: [{ scale: press.scale }] }}>
      <Pressable
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel={t('parent.gradesOverall', { defaultValue: 'المعدل العام المنشور' })}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.headerRow}>
            <Ionicons name="trophy" size={20} color="rgba(255,255,255,0.8)" />
            <Text style={styles.title}>
              {t('parent.gradesOverall', { defaultValue: 'معدّل الدرجات' })}
            </Text>
          </View>
          <Text style={styles.amount}>{average}%</Text>
          <Text style={styles.label}>
            {t('parent.gradesBasedOn', {
              count,
              defaultValue: `مبني على ${count} درجة منشورة`,
            })}
          </Text>
          <View style={styles.footerRow}>
            <Text style={styles.footerText}>
              {t('parent.tapToOpenDetails', { defaultValue: 'اضغط لعرض التفاصيل' })}
            </Text>
            <Ionicons name="chevron-back" size={14} color="rgba(255,255,255,0.7)" />
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: tokens.radius.xl,
    padding: tokens.spacing[5],
    marginBottom: tokens.spacing[4],
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: tokens.spacing[3],
  },
  title: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.heavy,
    color: 'rgba(255,255,255,0.9)',
  },
  amount: {
    fontSize: tokens.font.size['4xl'],
    fontWeight: tokens.font.weight.black,
    color: '#fff',
    textAlign: 'center',
  },
  label: {
    fontSize: tokens.font.size.sm,
    color: 'rgba(255,255,255,0.65)',
    textAlign: 'center',
    marginTop: 4,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: tokens.spacing[3],
  },
  footerText: {
    fontSize: tokens.font.size.xs,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: tokens.font.weight.bold,
  },
});

export default memo(GradeAverageCard);
