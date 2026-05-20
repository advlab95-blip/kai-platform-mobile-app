import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import { ROLE_BG } from '../_helpers';
import { styles } from '../_styles';
import SwipeableSheet from '../../../shared/SwipeableSheet';

type Props = {
  visible: boolean;
  institutes: any[];
  transferUsers: any[];
  transferFilterRole: string;
  transferFilterInst: string;
  transferSelectedUser: any;
  transferTargetInst: string;
  transferring: boolean;
  onClose: () => void;
  onChangeFilterRole: (k: string) => void;
  onChangeFilterInst: (id: string) => void;
  onSelectUser: (u: any) => void;
  onSelectTarget: (id: string) => void;
  onConfirm: () => void;
  // Labels
  titleLabel: string; // t('admin.transferStudentTeacher')
  allLabel: string; // t('common.all')
  teacherLabel: string;
  studentLabel: string;
  allInstitutesLabel: string;
  noDataLabel: string;
  closeLabel: string;
  confirmTransferLabel: string;
  roleLabelFor: (role: string) => string;
};

export default function TransferUserModal({
  visible,
  institutes,
  transferUsers,
  transferFilterRole,
  transferFilterInst,
  transferSelectedUser,
  transferTargetInst,
  transferring,
  onClose,
  onChangeFilterRole,
  onChangeFilterInst,
  onSelectUser,
  onSelectTarget,
  onConfirm,
  titleLabel,
  allLabel,
  teacherLabel,
  studentLabel,
  allInstitutesLabel,
  noDataLabel,
  closeLabel,
  confirmTransferLabel,
  roleLabelFor,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <Text style={styles.modalTitle}>{titleLabel}</Text>

        {/* Filters */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
          {[
            { key: 'all', label: allLabel },
            { key: 'teacher', label: teacherLabel },
            { key: 'student', label: studentLabel },
          ].map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, transferFilterRole === f.key && styles.filterChipActive]}
              onPress={() => onChangeFilterRole(f.key)}
            >
              <Text style={[styles.filterChipText, transferFilterRole === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Institute filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={[styles.filterChip, !transferFilterInst && styles.filterChipActive]}
              onPress={() => onChangeFilterInst('')}
            >
              <Text style={[styles.filterChipText, !transferFilterInst && styles.filterChipTextActive]}>{allInstitutesLabel}</Text>
            </TouchableOpacity>
            {institutes.map((inst) => (
              <TouchableOpacity
                key={inst.id}
                style={[styles.filterChip, transferFilterInst === inst.id && styles.filterChipActive]}
                onPress={() => onChangeFilterInst(inst.id)}
              >
                <Text style={[styles.filterChipText, transferFilterInst === inst.id && styles.filterChipTextActive]}>{inst.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* User list */}
        <ScrollView style={{ maxHeight: 200 }}>
          {transferUsers.map((user) => (
            <TouchableOpacity
              key={user.id}
              style={[
                styles.wizardOption,
                transferSelectedUser?.id === user.id && styles.wizardOptionActive,
              ]}
              onPress={() => onSelectUser(user)}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.roleBadgeSmall, { backgroundColor: ROLE_BG[user.role]?.bg || '#F1F5F9' }]}>
                  <Text style={[styles.roleBadgeSmallText, { color: ROLE_BG[user.role]?.text || Colors.textMuted }]}>
                    {roleLabelFor(user.role)}
                  </Text>
                </View>
                <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                  {institutes.find((i) => i.id === user.institute_id)?.name || '—'}
                </Text>
              </View>
              <Text style={[styles.wizardOptionText, transferSelectedUser?.id === user.id && styles.wizardOptionTextActive]}>
                {user.full_name}
              </Text>
            </TouchableOpacity>
          ))}
          {transferUsers.length === 0 && (
            <Text style={styles.emptyText}>{noDataLabel}</Text>
          )}
        </ScrollView>

        {/* Destination picker */}
        {transferSelectedUser && (
          <View style={{ marginTop: 12 }}>
            <Text style={[styles.fieldLabel, { marginBottom: 8 }]}>{confirmTransferLabel}:</Text>
            <ScrollView style={{ maxHeight: 120 }}>
              {institutes
                .filter((i) => i.id !== transferSelectedUser.institute_id)
                .map((inst) => (
                  <TouchableOpacity
                    key={inst.id}
                    style={[styles.wizardOption, transferTargetInst === inst.id && styles.wizardOptionActive]}
                    onPress={() => onSelectTarget(inst.id)}
                  >
                    <Text style={[styles.wizardOptionText, transferTargetInst === inst.id && styles.wizardOptionTextActive]}>
                      {inst.name}
                    </Text>
                    <Ionicons name="business" size={16} color={transferTargetInst === inst.id ? Colors.primary : Colors.textMuted} />
                  </TouchableOpacity>
                ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.modalBtnRow}>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>{closeLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalConfirmBtn, (!transferSelectedUser || !transferTargetInst || transferring) && { opacity: 0.4 }]}
            onPress={onConfirm}
            disabled={!transferSelectedUser || !transferTargetInst || transferring}
          >
            {transferring ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.modalConfirmText}>{confirmTransferLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SwipeableSheet>
  );
}
