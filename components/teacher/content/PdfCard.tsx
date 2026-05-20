import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import ListRow from '../cards/ListRow';
import { styles } from './styles';

export interface PdfCardProps {
  item: any;
  onOpen: (item: any) => void;
  onToggleVisibility: (item: any) => void;
  onDelete: (item: any) => void;
}

export default function PdfCard({
  item,
  onOpen,
  onToggleVisibility,
  onDelete,
}: PdfCardProps) {
  return (
    <View>
      <ListRow
        icon="document"
        iconGradient="success"
        title={item.title}
        subtitle={new Date(item.created_at).toLocaleDateString('ar-IQ')}
        onPress={() => onOpen(item)}
      />
      <View style={styles.materialActionsRow}>
        <TouchableOpacity style={{ padding: 6 }} onPress={() => onToggleVisibility(item)}>
          <Ionicons
            name={item.is_hidden ? 'eye-off' : 'eye'}
            size={16}
            color={item.is_hidden ? tokens.color.orange : tokens.color.success}
          />
        </TouchableOpacity>
        <TouchableOpacity style={{ padding: 6 }} onPress={() => onDelete(item)}>
          <Ionicons name="trash-outline" size={16} color={tokens.color.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
