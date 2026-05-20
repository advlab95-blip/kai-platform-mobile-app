// 3 shortcut tiles: records / reports / settings.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';

interface Tile {
  labelKey: string;
  defaultLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
  bg: string;
  route: string;
}

function Shortcuts() {
  const { t } = useTranslation();
  const router = useRouter();

  const tiles: Tile[] = [
    {
      labelKey: 'medical.records',
      defaultLabel: 'السجلات',
      icon: 'medical',
      bg: tokens.color.m500,
      route: '/(medical)/records',
    },
    {
      labelKey: 'medical.visits',
      defaultLabel: 'الزيارات',
      icon: 'medkit',
      bg: tokens.color.danger,
      route: '/(medical)/visits',
    },
    {
      labelKey: 'medical.medications',
      defaultLabel: 'الأدوية',
      icon: 'bandage',
      bg: tokens.color.warning,
      route: '/(medical)/medications',
    },
    {
      labelKey: 'medical.vaccinations',
      defaultLabel: 'التطعيمات',
      icon: 'shield-checkmark',
      bg: tokens.color.success,
      route: '/(medical)/vaccinations',
    },
    {
      labelKey: 'medical.critical',
      defaultLabel: 'الحالات الحرجة',
      icon: 'alert-circle',
      bg: '#DC2626',
      route: '/(medical)/critical',
    },
    {
      labelKey: 'medical.reportsTab',
      defaultLabel: 'التقارير',
      icon: 'document-text',
      bg: tokens.color.purple,
      route: '/(medical)/reports',
    },
  ];

  const goTo = (route: string) => {
    haptics.selection();
    router.push(route as any);
  };

  return (
    <View style={styles.grid}>
      {tiles.map((tile) => (
        <TouchableOpacity
          key={tile.route}
          style={styles.tile}
          onPress={() => goTo(tile.route)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t(tile.labelKey, { defaultValue: tile.defaultLabel })}
        >
          <View style={[styles.iconWrap, { backgroundColor: tile.bg }]}>
            <Ionicons name={tile.icon} size={22} color="#fff" />
          </View>
          <Text style={styles.label}>
            {t(tile.labelKey, { defaultValue: tile.defaultLabel })}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row-reverse', flexWrap: 'wrap', gap: 10, marginBottom: tokens.spacing[4] },
  tile: {
    flexBasis: '31%', flexGrow: 1,
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.xs,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: tokens.font.size.base,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    textAlign: 'center',
  },
});

export default memo(Shortcuts);
