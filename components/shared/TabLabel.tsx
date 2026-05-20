// Shared bottom-nav label.
// Allows up to 2 lines + scales font down to 0.8x on tight tabs so Arabic
// labels like "الإعدادات" / "الجدول" / "الخدمات" stop truncating to "...".
import React, { memo } from 'react';
import { Text, StyleSheet } from 'react-native';

interface Props {
  label: string;
  color: string;
  fontSize: number;
  focused?: boolean;
}

function TabLabel({ label, color, fontSize, focused }: Props) {
  return (
    <Text
      numberOfLines={2}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      allowFontScaling={false}
      style={[
        styles.label,
        {
          color,
          fontSize,
          fontWeight: focused ? '800' : '700',
        },
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  label: {
    textAlign: 'center',
    lineHeight: undefined,
    paddingHorizontal: 2,
  },
});

export default memo(TabLabel);
