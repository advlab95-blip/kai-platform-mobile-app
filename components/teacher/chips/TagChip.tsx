import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';

export type TagTone =
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'purple'
  | 'pink'
  | 'orange'
  | 'teal'
  | 'neutral';

export interface TagChipProps {
  label: string;
  tone?: TagTone;
  icon?: string;
}

function TagChip({ label, tone = 'neutral', icon }: TagChipProps) {
  const { background, foreground } = resolveTone(tone);

  return (
    <View style={[styles.container, { backgroundColor: background }]}>
      {icon && (
        <Ionicons
          name={icon as React.ComponentProps<typeof Ionicons>['name']}
          size={tokens.font.size.base}
          color={foreground}
          style={styles.icon}
        />
      )}
      <Text
        style={[styles.label, { color: foreground }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        allowFontScaling={false}
      >
        {label}
      </Text>
    </View>
  );
}

function resolveTone(tone: TagTone): { background: string; foreground: string } {
  switch (tone) {
    case 'success':
      return { background: tokens.color.successBg, foreground: tokens.color.success };
    case 'warning':
      return { background: tokens.color.warningBg, foreground: tokens.color.warning };
    case 'danger':
      return { background: tokens.color.dangerBg, foreground: tokens.color.danger };
    case 'info':
      return { background: tokens.color.infoBg, foreground: tokens.color.info };
    case 'purple':
      return { background: tokens.color.purpleBg, foreground: tokens.color.purple };
    case 'pink':
      return { background: tokens.color.pinkBg, foreground: tokens.color.pink };
    case 'orange':
      return { background: tokens.color.orangeBg, foreground: tokens.color.orange };
    case 'teal':
      return { background: tokens.color.tealBg, foreground: tokens.color.teal };
    case 'neutral':
    default:
      return { background: tokens.color.surface2, foreground: tokens.color.text2 };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: tokens.radius.pill,
    alignSelf: 'flex-start',
  },
  icon: { marginEnd: 4 },
  label: {
    fontSize: tokens.font.size.xs,
    fontWeight: tokens.font.weight.semi,
  },
});

export default memo(TagChip);
