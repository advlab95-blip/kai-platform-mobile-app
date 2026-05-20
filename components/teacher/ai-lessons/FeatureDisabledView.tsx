import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import BackHeader from '../../shared/BackHeader';
import { tokens } from '../../../constants/designTokens';
import { styles } from './styles';

export default function FeatureDisabledView() {
  const { t } = useTranslation();
  return (
    <SafeAreaView style={styles.container}>
      <BackHeader title="دروس AI الذكية" fallbackRoute="/(teacher)/services" />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Ionicons name="lock-closed" size={48} color={tokens.color.text4} />
        <Text style={{ fontSize: 16, color: tokens.color.text2, marginTop: 12, fontWeight: '700' }}>
          {t('teacher.featureDisabled', { defaultValue: 'هذه الميزة غير مفعّلة' })}
        </Text>
      </View>
    </SafeAreaView>
  );
}
