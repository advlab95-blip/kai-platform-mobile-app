import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Colors } from '../../../constants/colors';
import { ListSkeleton } from '../../animated/PageSkeleton';
import InstituteCard from './InstituteCard';
import { styles } from './_styles';

type FilterInstType = 'all' | 'institute' | 'school';

type Props = {
  loading: boolean;
  institutes: any[];
  filterInstType: FilterInstType;
  onChangeFilterInstType: (t: FilterInstType) => void;
  expandedInstitute: string | null;
  expandedGroup: string | null;
  // Labels
  allLabel: string; // t('common.all')
  institutesLabel: string; // t('admin.institutes')
  schoolsOnlyLabel: string; // t('admin.schoolsOnly')
  institutionsLabel: string; // t('admin.institutions')
  noInstitutionsLabel: string; // t('admin.noInstitutions')
  cityFallbackLabel: string;
  userLabel: string;
  instituteTypeLabel: string;
  schoolLabel: string;
  frozenLabel: string;
  noDataLabel: string;
  addAccountWizardLabel: string;
  roleLabelFor: (role: string) => string;
  // Per-institute data + handlers
  getUsersForInstitute: (instId: string) => any[];
  onToggleExpandInstitute: (instId: string) => void;
  onOpenResetCode: (instId: string) => void;
  onOpenDeleteInstitute: (inst: any) => void;
  onOpenWizard: (inst: any) => void;
  onSetExpandedGroup: (key: string | null) => void;
  onOpenUser: (user: any) => void;
  onDeleteUser: (user: any) => void;
  onOpenInternalTransfer: (user: any, instId: string) => void;
  avatars?: Record<string, string>;
  onPreviewAvatar?: (url?: string | null) => void;
};

export default function InstitutesSection(props: Props) {
  const {
    loading,
    institutes,
    filterInstType,
    onChangeFilterInstType,
    expandedInstitute,
    expandedGroup,
    allLabel,
    institutesLabel,
    schoolsOnlyLabel,
    institutionsLabel,
    noInstitutionsLabel,
    cityFallbackLabel,
    userLabel,
    instituteTypeLabel,
    schoolLabel,
    frozenLabel,
    noDataLabel,
    addAccountWizardLabel,
    roleLabelFor,
    getUsersForInstitute,
    onToggleExpandInstitute,
    onOpenResetCode,
    onOpenDeleteInstitute,
    onOpenWizard,
    onSetExpandedGroup,
    onOpenUser,
    onDeleteUser,
    onOpenInternalTransfer,
    avatars,
    onPreviewAvatar,
  } = props;

  const filtered = institutes.filter((i: any) =>
    filterInstType === 'all' || !filterInstType ? true : i.type === filterInstType
  );

  return (
    <View style={styles.section}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, justifyContent: 'flex-end' }}>
        {(['all', 'institute', 'school'] as FilterInstType[]).map(ft => (
          <TouchableOpacity
            key={ft}
            style={{
              backgroundColor: (filterInstType || 'all') === ft ? Colors.primary : '#F1F5F9',
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 6,
            }}
            onPress={() => onChangeFilterInstType(ft)}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: (filterInstType || 'all') === ft ? '#fff' : Colors.text }}>
              {ft === 'all' ? allLabel : ft === 'institute' ? institutesLabel : schoolsOnlyLabel}
            </Text>
          </TouchableOpacity>
        ))}
        <Text style={styles.sectionTitle}>{institutionsLabel}</Text>
      </View>

      {loading ? (
        <ListSkeleton count={4} />
      ) : filtered.length === 0 ? (
        <Text style={styles.emptyText}>{noInstitutionsLabel}</Text>
      ) : (
        filtered.map((inst) => {
          const instUsers = getUsersForInstitute(inst.id);
          const isExpanded = expandedInstitute === inst.id;
          return (
            <InstituteCard
              key={inst.id}
              inst={inst}
              instUsers={instUsers}
              isExpanded={isExpanded}
              expandedGroup={expandedGroup}
              roleLabelFor={roleLabelFor}
              cityFallbackLabel={cityFallbackLabel}
              userLabel={userLabel}
              instituteTypeLabel={instituteTypeLabel}
              schoolLabel={schoolLabel}
              frozenLabel={frozenLabel}
              noDataLabel={noDataLabel}
              addAccountWizardLabel={addAccountWizardLabel}
              onToggleExpand={() => onToggleExpandInstitute(inst.id)}
              onOpenResetCode={() => onOpenResetCode(inst.id)}
              onOpenDeleteInstitute={() => onOpenDeleteInstitute(inst)}
              onOpenWizard={() => onOpenWizard(inst)}
              onSetExpandedGroup={onSetExpandedGroup}
              onOpenUser={onOpenUser}
              onDeleteUser={onDeleteUser}
              onOpenInternalTransfer={(user) => onOpenInternalTransfer(user, inst.id)}
              avatars={avatars}
              onPreviewAvatar={onPreviewAvatar}
            />
          );
        })
      )}
    </View>
  );
}
