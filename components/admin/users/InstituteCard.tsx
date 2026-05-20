import React from 'react';
import { View, Text, TouchableOpacity, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import WhatsAppButton from '../../shared/WhatsAppButton';
import { ROLE_BG, ROLE_ORDER, ROLE_ICONS } from './_helpers';
import { styles } from './_styles';

type Props = {
  inst: any;
  instUsers: any[];
  isExpanded: boolean;
  expandedGroup: string | null;
  roleLabelFor: (role: string) => string;
  // Labels (i18n)
  cityFallbackLabel: string; // t('admin.withoutCity')
  userLabel: string; // t('admin.user')
  instituteTypeLabel: string; // t('admin.institutionType')
  schoolLabel: string; // t('admin.school')
  frozenLabel: string; // t('admin.frozen')
  noDataLabel: string; // t('common.noData')
  addAccountWizardLabel: string; // 'إضافة حساب' — provided by parent (Admin or Institute admin)
  // Handlers
  onToggleExpand: () => void;
  onOpenResetCode: () => void;
  onOpenDeleteInstitute: () => void;
  onOpenWizard: () => void;
  onSetExpandedGroup: (key: string | null) => void;
  onOpenUser: (user: any) => void;
  onDeleteUser: (user: any) => void;
  onOpenInternalTransfer: (user: any) => void;
  avatars?: Record<string, string>;
  onPreviewAvatar?: (url?: string | null) => void;
};

// Single institute card with header + collapsible body containing role groups.
// Pure presentational — `instUsers` is supplied by the parent (already filtered
// by institute_id) and all callbacks bubble up.
export default function InstituteCard({
  inst,
  instUsers,
  isExpanded,
  expandedGroup,
  roleLabelFor,
  cityFallbackLabel,
  userLabel,
  instituteTypeLabel,
  schoolLabel,
  frozenLabel,
  noDataLabel,
  addAccountWizardLabel,
  onToggleExpand,
  onOpenResetCode,
  onOpenDeleteInstitute,
  onOpenWizard,
  onSetExpandedGroup,
  onOpenUser,
  onDeleteUser,
  onOpenInternalTransfer,
  avatars,
  onPreviewAvatar,
}: Props) {
  const renderUser = (user: any) => {
    const effectiveAvatar = avatars?.[user.id] || user.avatar_url || null;
    return (
      <TouchableOpacity key={user.id} style={[styles.userListItem, { marginLeft: 8 }]} onPress={() => onOpenUser(user)}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity onPress={() => onDeleteUser(user)}>
            <Ionicons name="trash-outline" size={14} color={Colors.error} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onOpenInternalTransfer(user)}>
            <Ionicons name="swap-horizontal" size={14} color={Colors.primary} />
          </TouchableOpacity>
          <WhatsAppButton phone={user.phone} />
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
            {user.is_frozen && (
              <View style={[styles.roleBadgeSmall, { backgroundColor: '#FFF7ED' }]}>
                <Text style={[styles.roleBadgeSmallText, { color: '#F97316' }]}>{frozenLabel}</Text>
              </View>
            )}
            <Text style={styles.userListName}>{user.full_name}</Text>
          </View>
          <View style={[styles.roleBadgeSmall, { backgroundColor: ROLE_BG[user.role]?.bg || '#F1F5F9' }]}>
            <Text style={[styles.roleBadgeSmallText, { color: ROLE_BG[user.role]?.text || Colors.textMuted }]}>
              {roleLabelFor(user.role)}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={(e) => {
            // Stop the row's onPress (open user detail) only when an avatar is
            // previewable — keeps the detail open as the default for placeholder rows.
            if (effectiveAvatar && onPreviewAvatar) {
              e.stopPropagation();
              onPreviewAvatar(effectiveAvatar);
            }
          }}
          hitSlop={6}
        >
          {effectiveAvatar ? (
            <Image
              source={{ uri: effectiveAvatar }}
              style={styles.userAvatarSmall}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View style={[styles.userAvatarSmall, { backgroundColor: ROLE_BG[user.role]?.bg || '#F1F5F9', alignItems: 'center', justifyContent: 'center' }]}>
              <Ionicons name="person" size={14} color={ROLE_BG[user.role]?.text || Colors.textMuted} />
            </View>
          )}
        </Pressable>
        <Ionicons name="chevron-back" size={14} color={Colors.textMuted} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.instituteCard}>
      <TouchableOpacity
        style={styles.instituteHeader}
        onPress={onToggleExpand}
        activeOpacity={0.7}
      >
        <View style={styles.instituteHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.textMuted}
            />
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation();
                onOpenResetCode();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="key-outline" size={16} color="#7C3AED" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={(e) => { e.stopPropagation(); onOpenDeleteInstitute(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={17} color={Colors.error} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.instituteName}>{inst.name}</Text>
            <Text style={styles.instituteCity}>
              {inst.city || cityFallbackLabel} — {instUsers.length} {userLabel}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={[styles.instituteIcon, inst.type === 'school' ? { backgroundColor: '#FFF7ED' } : {}]}>
              <Ionicons name={inst.type === 'school' ? 'school' : 'business'} size={20} color={inst.type === 'school' ? '#B45309' : Colors.primary} />
            </View>
            <View style={[styles.roleBadgeSmall, { backgroundColor: inst.type === 'school' ? '#FFF7ED' : '#EEF2FF' }]}>
              <Text style={[styles.roleBadgeSmallText, { color: inst.type === 'school' ? '#B45309' : Colors.primary }]}>
                {inst.type === 'school' ? schoolLabel : instituteTypeLabel}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.instituteBody}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, paddingVertical: 11, borderRadius: 12, marginBottom: 10 }}
            onPress={onOpenWizard}
          >
            <Ionicons name="person-add" size={18} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{addAccountWizardLabel}</Text>
          </TouchableOpacity>
          {ROLE_ORDER.map(role => {
            const roleUsers = instUsers.filter((u: any) => u.role === role);
            if (roleUsers.length === 0) return null;
            const isRoleOpen = expandedGroup === `${inst.id}_${role}`;
            const bg = ROLE_BG[role] || { bg: '#F1F5F9', text: Colors.textMuted };
            return (
              <View key={role}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: bg.bg, padding: 12, borderRadius: 12, marginBottom: 4 }}
                  onPress={() => onSetExpandedGroup(isRoleOpen ? null : `${inst.id}_${role}`)}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name={isRoleOpen ? 'chevron-up' : 'chevron-down'} size={14} color={bg.text} />
                    <Text style={{ fontSize: 11, color: bg.text, fontWeight: '700' }}>{roleUsers.length}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: bg.text }}>{roleLabelFor(role)}</Text>
                    <Ionicons name={(ROLE_ICONS[role] || 'person') as any} size={16} color={bg.text} />
                  </View>
                </TouchableOpacity>
                {isRoleOpen && roleUsers.map(renderUser)}
              </View>
            );
          })}
          {instUsers.length === 0 && <Text style={styles.emptyText}>{noDataLabel}</Text>}
        </View>
      )}
    </View>
  );
}
