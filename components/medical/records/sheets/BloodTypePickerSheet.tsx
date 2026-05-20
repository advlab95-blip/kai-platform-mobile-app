// 8-button blood-type grid in a SwipeableSheet.
import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { tokens } from '../../../../constants/designTokens';
import { BLOOD_TYPES } from '../../../../constants/medical';

interface Props {
  visible: boolean;
  onClose: () => void;
  selected: string;
  onSelect: (type: string) => void;
}

function BloodTypePickerSheet({ visible, onClose, selected, onSelect }: Props) {
  const { t } = useTranslation();

  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.5}>
      <View style={styles.body}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
            <Ionicons name="close" size={24} color={tokens.color.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('institute.bloodType')}</Text>
        </View>
        <View style={styles.grid}>
          {BLOOD_TYPES.map((type) => {
            const isActive = selected === type;
            return (
              <TouchableOpacity
                key={type}
                style={[styles.btn, isActive && styles.btnActive]}
                onPress={() => {
                  onSelect(type);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={type}
              >
                <Text style={[styles.btnText, isActive && styles.btnTextActive]}>{type}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: tokens.spacing[5],
    paddingTop: 4,
    paddingBottom: tokens.spacing[5],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: tokens.spacing[4],
  },
  title: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  btn: {
    width: 70,
    height: 50,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.color.border,
  },
  btnActive: {
    backgroundColor: tokens.color.m100,
    borderColor: tokens.color.m500,
  },
  btnText: {
    fontSize: tokens.font.size.xl,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.text,
    fontFamily: 'Rubik',
  },
  btnTextActive: { color: tokens.color.m700 },
});

export default memo(BloodTypePickerSheet);
