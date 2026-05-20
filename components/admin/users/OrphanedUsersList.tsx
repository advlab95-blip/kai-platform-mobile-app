import React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import WhatsAppButton from '../../shared/WhatsAppButton';
import { styles } from './_styles';

type Props = {
  orphans: any[];
  title: string; // t('admin.usersWithoutInstitution')
  onDeleteUser: (user: any) => void;
  avatars?: Record<string, string>;
  onPreviewAvatar?: (url?: string | null) => void;
};

// Users whose institute_id no longer matches any loaded institute (and isn't an
// admin). Pure presentational — the parent computes the orphans list.
export default function OrphanedUsersList({ orphans, title, onDeleteUser, avatars, onPreviewAvatar }: Props) {
  if (orphans.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: Colors.error }]}>{title} ({orphans.length})</Text>
      {orphans.map((user: any) => {
        const effectiveAvatar = avatars?.[user.id] || user.avatar_url || null;
        return (
          <View key={user.id} style={[styles.userCard, { borderColor: '#FEE2E2' }]}>
            <View style={styles.userCardRow}>
              <TouchableOpacity onPress={() => onDeleteUser(user)}>
                <Ionicons name="trash-outline" size={16} color={Colors.error} />
              </TouchableOpacity>
              <WhatsAppButton phone={user.phone} />
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.userCardName}>{user.full_name}</Text>
                <Text style={styles.userCardRole}>{user.role}</Text>
              </View>
              <Pressable
                onPress={() => effectiveAvatar && onPreviewAvatar?.(effectiveAvatar)}
                hitSlop={6}
              >
                {effectiveAvatar ? (
                  <Image
                    source={{ uri: effectiveAvatar }}
                    style={styles.userAvatar}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.userAvatar, { backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }]}>
                    <Ionicons name="person" size={18} color={Colors.error} />
                  </View>
                )}
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}
