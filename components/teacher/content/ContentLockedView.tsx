import React from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './styles';

/**
 * Shown when the `content_management` feature flag is disabled for the institute.
 * Pure presentational placeholder.
 */
export default function ContentLockedView() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="lock-closed" size={48} color="#E2E8F0" />
        <Text style={{ fontSize: 16, color: Colors.textMuted, marginTop: 12 }}>
          إدارة المحتوى غير مفعّلة
        </Text>
      </View>
    </SafeAreaView>
  );
}
