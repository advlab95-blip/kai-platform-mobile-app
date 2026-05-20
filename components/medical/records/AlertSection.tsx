// Red-tinted wrapper around the two alert fields (allergies + chronic conditions).
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import HealthFieldCard from './HealthFieldCard';

interface Props {
  allergies: string;
  setAllergies: (v: string) => void;
  chronicConditions: string;
  setChronicConditions: (v: string) => void;
}

function AlertSection({ allergies, setAllergies, chronicConditions, setChronicConditions }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('medical.healthAlerts')}</Text>
        <Ionicons name="warning" size={16} color={tokens.color.m500} />
      </View>

      <View style={styles.field}>
        <HealthFieldCard
          label={t('medical.drugAllergies')}
          iconName="alert-circle"
          iconColor={tokens.color.fieldAllergy}
          iconBg={tokens.color.fieldAllergyBg}
          value={allergies}
          onChangeText={setAllergies}
          placeholder={t('medical.nonePlaceholder')}
          placeholderColor={tokens.color.m300}
          alertStyle
        />
      </View>

      <HealthFieldCard
        label={t('medical.chronicDiseases')}
        iconName="fitness"
        iconColor={tokens.color.fieldAllergy}
        iconBg={tokens.color.fieldAllergyBg}
        value={chronicConditions}
        onChangeText={setChronicConditions}
        placeholder={t('medical.nonePlaceholder')}
        placeholderColor={tokens.color.m300}
        multiline
        alertStyle
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: tokens.color.m50,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: tokens.spacing[3],
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginBottom: tokens.spacing[3],
  },
  title: {
    fontSize: tokens.font.size.md,
    fontWeight: tokens.font.weight.heavy,
    color: tokens.color.m500,
  },
  field: { marginBottom: tokens.spacing[3] },
});

export default memo(AlertSection);
