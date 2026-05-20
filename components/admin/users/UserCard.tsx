import React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import WhatsAppButton from '../../shared/WhatsAppButton';
import { ROLE_BG } from './_helpers';
import { styles } from './_styles';

type Props = {
  user: any;
  roleLabel: string;
  isPaid: boolean;
  paidLabel: string;
  paySubscriptionLabel: string;
  onPress: () => void;
  onDelete: () => void;
  onMarkPaid: () => void;
  // Optional bulk-fetched avatar URL — falls back to user.avatar_url if not in the map yet.
  avatarUrl?: string | null;
  onPreviewAvatar?: (url?: string | null) => void;
};

// Card-style row used in the search-results list at the top of the screen.
export default function UserCard({
  user,
  roleLabel,
  isPaid,
  paidLabel,
  paySubscriptionLabel,
  onPress,
  onDelete,
  onMarkPaid,
  avatarUrl,
  onPreviewAvatar,
}: Props) {
  // Prefer the bulk-fetched URL when available, otherwise fall back to whatever
  // is on the user row (preserves existing behaviour).
  const effectiveAvatar = avatarUrl || user.avatar_url || null;
  return (
    <TouchableOpacity style={styles.userCard} onPress={onPress}>
      <View style={styles.userCardRow}>
        <TouchableOpacity onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={Colors.error} />
        </TouchableOpacity>
        <WhatsAppButton phone={user.phone} />
        <View style={{ flex: 1 }}>
          <Text style={styles.userCardName}>{user.full_name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <View style={[styles.roleBadge, { backgroundColor: ROLE_BG[user.role]?.bg || '#F1F5F9' }]}>
              <Text style={[styles.roleBadgeText, { color: ROLE_BG[user.role]?.text || Colors.textMuted }]}>
                {roleLabel}
              </Text>
            </View>
            {isPaid && (
              <View style={[styles.roleBadge, { backgroundColor: '#ECFDF5' }]}>
                <Text style={[styles.roleBadgeText, { color: '#059669' }]}>{paidLabel}</Text>
              </View>
            )}
          </View>
        </View>
        <Pressable
          onPress={(e) => {
            // Only intercept the press when there's something to preview, so the
            // surrounding card's onPress (open user detail) still fires for users
            // without an avatar.
            if (effectiveAvatar && onPreviewAvatar) {
              e.stopPropagation();
              onPreviewAvatar(effectiveAvatar);
            }
          }}
          hitSlop={8}
        >
          {effectiveAvatar ? (
            <Image source={{ uri: effectiveAvatar }} style={styles.userAvatar} contentFit="cover" cachePolicy="memory-disk" transition={200} />
          ) : (
            <View style={[styles.userAvatar, { backgroundColor: ROLE_BG[user.role]?.bg || '#F1F5F9', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={18} color={ROLE_BG[user.role]?.text || Colors.textMuted} />
            </View>
          )}
        </Pressable>
      </View>
      {!isPaid && (
        <TouchableOpacity style={styles.payBtn} onPress={onMarkPaid}>
          <Ionicons name="card-outline" size={14} color="#7C3AED" />
          <Text style={styles.payBtnText}>{paySubscriptionLabel}</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}
