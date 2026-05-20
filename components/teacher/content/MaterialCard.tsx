import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import ListRow from '../cards/ListRow';
import { styles } from './styles';

export interface MaterialCardProps {
  item: any;
  onOpen: (item: any) => void;
  onLongPress: (item: any) => void;
  onToggleVisibility: (item: any) => void;
  onDelete: (item: any) => void;
}

export default function MaterialCard({
  item,
  onOpen,
  onLongPress,
  onToggleVisibility,
  onDelete,
}: MaterialCardProps) {
  const { t } = useTranslation();
  return (
    <View>
      <ListRow
        icon="book"
        iconGradient="info"
        title={item.title}
        subtitle={item.price ? `${item.price} د.ع` : t('common.free')}
        meta={item.buyers_count ? `${item.buyers_count}` : undefined}
        onPress={() => onOpen(item)}
        onLongPress={() => onLongPress(item)}
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
