import React, { memo, useCallback } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { tokens } from '../../../constants/designTokens';
import { useSpringPress } from '../../../hooks/useSpringPress';
import { haptics } from '../../../utils/haptics';

export interface FilterChipProps {
  label: string;
  active: boolean;
  count?: number;
  accent?: 'brand' | 'student';
  onPress: () => void;
}

const HEIGHT = 36;

function FilterChip({ label, active, count, accent = 'brand', onPress }: FilterChipProps) {
  const activeGradient = accent === 'student' ? tokens.gradient.student : tokens.gradient.brand;
  const activeShadow = accent === 'student' ? tokens.shadow.teal : tokens.shadow.brand;
  const { scale, onPressIn, onPressOut } = useSpringPress();

  const handlePress = useCallback(() => {
    haptics.selection();
    onPress();
  }, [onPress]);

  const showCount = typeof count === 'number';

  return (
    <Animated.View
      style={[
        active ? activeShadow : null,
        // On react-native-web the parent flex row default-stretches children
        // vertically, which makes the active chip's LinearGradient render as a
        // tall column running down the content area. Explicit height + alignSelf
        // pins each chip to its natural height (HEIGHT = 36) regardless of how
        // the ScrollView contentContainer aligns its children.
        { height: HEIGHT, alignSelf: 'center', transform: [{ scale }] },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={label}
        onPress={handlePress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={styles.pressable}
      >
        {active ? (
          <LinearGradient
            colors={activeGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.body, styles.bodyActive]}
          >
            <ChipContent label={label} count={count} active showCount={showCount} />
          </LinearGradient>
        ) : (
          <View style={[styles.body, styles.bodyInactive]}>
            <ChipContent label={label} count={count} active={false} showCount={showCount} />
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

function ChipContent({
  label,
  count,
  active,
  showCount,
}: {
  label: string;
  count?: number;
  active: boolean;
  showCount: boolean;
}) {
  return (
    <>
      <Text
        style={[styles.label, { color: active ? '#fff' : tokens.color.text2 }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {label}
      </Text>
      {showCount && (
        <View
          style={[
            styles.countPill,
            { backgroundColor: active ? 'rgba(255,255,255,0.25)' : tokens.color.surface2 },
          ]}
        >
          <Text
            style={[styles.countText, { color: active ? '#fff' : tokens.color.text2 }]}
            numberOfLines={1}
          >
            {count}
          </Text>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  pressable: {
    borderRadius: tokens.radius.pill,
    overflow: 'hidden',
  },
  body: {
    height: HEIGHT,
    paddingHorizontal: 14,
    borderRadius: tokens.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyActive: {},
  bodyInactive: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  label: {
    fontSize: tokens.font.size.lg,
    fontWeight: tokens.font.weight.medium,
  },
  countPill: {
    marginStart: 8,
    minWidth: 22,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: tokens.radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.bold,
  },
});

export default memo(FilterChip);
