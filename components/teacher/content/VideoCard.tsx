import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import TagChip from '../chips/TagChip';
import { styles } from './styles';

export interface VideoCardProps {
  item: any;
  onPlay: (item: any) => void;
  onShowViewers: (item: any) => void;
  onToggleVisibility: (item: any) => void;
  onEdit: (item: any) => void;
  onDelete: (item: any) => void;
}

/**
 * Single video row — thumbnail, title, action icons (viewers/visibility/edit/delete).
 * All actions are surfaced via callbacks; the parent owns Supabase + state.
 */
export default function VideoCard({
  item,
  onPlay,
  onShowViewers,
  onToggleVisibility,
  onEdit,
  onDelete,
}: VideoCardProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.videoRow}>
        <TouchableOpacity onPress={() => onPlay(item)}>
          <LinearGradient
            colors={tokens.gradient.brand}
            style={[styles.videoThumb, { alignItems: 'center', justifyContent: 'center' }]}
          >
            <Ionicons name="play-circle" size={32} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>
        <TouchableOpacity style={styles.videoInfo} onPress={() => onPlay(item)}>
          <Text style={styles.videoTitle}>{item.title || t('teacherContent.noTitle')}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Text style={styles.videoDate}>
              {item.created_at ? new Date(item.created_at).toLocaleDateString('ar-IQ') : ''}
            </Text>
            {(item.views_count || 0) > 0 && (
              <TagChip tone="neutral" icon="eye" label={String(item.views_count)} />
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onShowViewers(item)}>
          <Ionicons name="people-outline" size={18} color={tokens.color.brand500} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onToggleVisibility(item)}>
          <Ionicons
            name={item.is_hidden ? 'eye-off' : 'eye'}
            size={18}
            color={item.is_hidden ? tokens.color.orange : tokens.color.success}
          />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onEdit(item)}>
          <Ionicons name="create-outline" size={18} color={tokens.color.brand500} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => onDelete(item)}>
          <Ionicons name="trash-outline" size={18} color={tokens.color.danger} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
