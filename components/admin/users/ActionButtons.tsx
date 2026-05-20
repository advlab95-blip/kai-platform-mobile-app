import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './_styles';

type Props = {
  manageInstitutionsLabel: string;
  transferLabel: string;
  onManageInstitutions: () => void;
  onOpenTransfer: () => void;
};

// Top action row — manage institutions (navigates) and open transfer modal.
export default function ActionButtons({
  manageInstitutionsLabel,
  transferLabel,
  onManageInstitutions,
  onOpenTransfer,
}: Props) {
  return (
    <>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#EEF2FF', flex: 1 }]}
          onPress={onManageInstitutions}
        >
          <Ionicons name="business" size={20} color={Colors.primary} />
          <Text style={[styles.actionBtnText, { color: Colors.primary }]}>{manageInstitutionsLabel}</Text>
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#FFF7ED' }]}
          onPress={onOpenTransfer}
        >
          <Ionicons name="swap-horizontal" size={20} color="#F97316" />
          <Text style={[styles.actionBtnText, { color: '#F97316' }]}>{transferLabel}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}
