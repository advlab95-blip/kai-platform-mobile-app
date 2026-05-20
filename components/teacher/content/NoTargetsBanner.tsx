import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Yellow warning banner — shown at top when teacher has loaded targets but none are
 * selected. Pure presentational; visibility is controlled by the parent.
 */
export default function NoTargetsBanner() {
  return (
    <View
      style={{
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: '#FEF3C7',
        borderBottomWidth: 1,
        borderBottomColor: '#FDE68A',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <Ionicons name="warning" size={16} color="#D97706" />
      <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: '#92400E', textAlign: 'right' }}>
        ما مختار أي صف — اختر صف واحد أو أكثر قبل الرفع أو اضغط "اختر الكل".
      </Text>
    </View>
  );
}
