import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import ListRow from '../cards/ListRow';
import { styles } from './styles';

export interface HomeworkCardProps {
  item: any;
  onOpen: (item: any) => void;
  onToggleVisibility: (item: any) => void;
  onDelete: (item: any) => void;
}

export default function HomeworkCard({
  item,
  onOpen,
  onToggleVisibility,
  onDelete,
}: HomeworkCardProps) {
  const subtitle = item.description
    ? item.description
    : item.due_date
      ? `الموعد: ${new Date(item.due_date).toLocaleDateString('ar-IQ')}`
      : undefined;
  const meta = item.attachment_url
    ? 'مرفق'
    : item.due_date
      ? new Date(item.due_date).toLocaleDateString('ar-IQ')
      : undefined;

  return (
    <View>
      <ListRow
        icon="document-text"
        iconGradient="warning"
        title={item.title}
        subtitle={subtitle}
        meta={meta}
        onPress={() => onOpen(item)}
      />
      <View style={styles.materialActionsRow}>
        <TouchableOpacity style={{ padding: 6 }} onPress={() => onToggleVisibility(item)}>
          <Ionicons
            name={item.is_hidden ? 'eye-off' : 'eye'}
            size={18}
            color={item.is_hidden ? tokens.color.orange : tokens.color.success}
          />
        </TouchableOpacity>
        <TouchableOpacity style={{ padding: 6 }} onPress={() => onDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
