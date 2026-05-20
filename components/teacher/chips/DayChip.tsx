import React, { memo, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

export interface DayChipProps {
  label: string;
  dayNumber: number;
  active: boolean;
  muted?: boolean;
  accent?: 'brand' | 'student';
  showNumber?: boolean;
  onPress: () => void;
}

const WIDTH = 60;
const CHIP_HEIGHT = 64;

function DayChip({ label, dayNumber, active, muted = false, accent = 'brand', showNumber = true, onPress }: DayChipProps) {
  const activeGradient = accent === 'student' ? tokens.gradient.student : tokens.gradient.brand;
  const activeShadow = accent === 'student' ? tokens.shadow.teal : tokens.shadow.brand;
  const { scale, onPressIn, onPressOut } = useSpringPress();

  const handlePress = useCallback(() => {
    if (muted) return;
    haptics.selection();
    onPress();
  }, [muted, onPress]);

  const numberColor = active ? '#fff' : tokens.color.text;
  const labelColor = active ? '#fff' : tokens.color.text2;

  return (
    <Animated.View
      style={[
        active ? activeShadow : null,
        { transform: [{ scale }], opacity: muted ? 0.4 : 1 },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active, disabled: muted }}
        accessibilityLabel={`${label} ${dayNumber}`}
        onPress={handlePress}
        onPressIn={muted ? undefined : onPressIn}
        onPressOut={muted ? undefined : onPressOut}
        disabled={muted}
        style={styles.pressable}
      >
        {active ? (
          <LinearGradient
            colors={activeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.body, styles.bodyActive]}
          >
            <DayContent dayNumber={dayNumber} label={label} numberColor={numberColor} labelColor={labelColor} showNumber={showNumber} />
          </LinearGradient>
        ) : (
          <View style={[styles.body, styles.bodyInactive]}>
            <DayContent dayNumber={dayNumber} label={label} numberColor={numberColor} labelColor={labelColor} showNumber={showNumber} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function DayContent({
  dayNumber,
  label,
  numberColor,
  labelColor,
  showNumber,
}: {
  dayNumber: number;
  label: string;
  numberColor: string;
  labelColor: string;
  showNumber: boolean;
}) {
  return (
    <>
      {showNumber ? (
        <Text style={[styles.number, { color: numberColor }]} numberOfLines={1}>
          {dayNumber}
        </Text>
      ) : null}
      <Text
        style={[styles.label, showNumber ? null : styles.labelCentered, { color: labelColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {
    width: WIDTH,
    height: CHIP_HEIGHT,
    borderRadius: tokens.radius.lg,
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
  },
  bodyActive: {},
  bodyInactive: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  number: {
    fontSize: tokens.font.size['2xl'],
    fontWeight: tokens.font.weight.bold,
    fontVariant: ['tabular-nums'],
    lineHeight: tokens.font.size['2xl'] + 4,
  },
  label: {
    marginTop: 2,
    fontSize: tokens.font.size.sm,
    fontWeight: tokens.font.weight.medium,
  },
  labelCentered: {
    marginTop: 0,
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.semi,
  },
});

export default memo(DayChip);
