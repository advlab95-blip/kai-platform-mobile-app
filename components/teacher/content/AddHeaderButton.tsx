import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';

export interface AddHeaderButtonProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
}

/**
 * "+ Upload / Create" button shown as ListHeaderComponent on each tab list.
 */
export default function AddHeaderButton({ icon, label, onPress }: AddHeaderButtonProps) {
  return (
    <TouchableOpacity style={styles.addBtn} onPress={onPress}>
      <Ionicons name={icon} size={18} color="#fff" />
      <Text style={styles.addBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}
