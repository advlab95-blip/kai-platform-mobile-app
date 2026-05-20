import React from 'react';
import { View, Text, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { styles } from './_styles';

type Permissions = { accounts: boolean; classes: boolean };

type Props = {
  institutes: any[];
  instPermissions: Record<string, Permissions>;
  // Live streaming flag lookup is owned by the parent (it knows the full
  // allFlags array). We just receive a precomputed boolean per institute.
  isLiveStreamingEnabled: (instId: string) => boolean;
  onTogglePermission: (instId: string, field: 'accounts' | 'classes') => void;
  onToggleLiveStreaming: (instId: string, next: boolean) => void;
  // Labels
  title: string; // t('admin.institutionPermissions')
  accountsLabel: string;
  classesLabel: string;
  liveStreamingLabel: string;
  liveEnabledLabel: string;
  liveStoppedLabel: string;
};

export default function InstitutionPermissionsList({
  institutes,
  instPermissions,
  isLiveStreamingEnabled,
  onTogglePermission,
  onToggleLiveStreaming,
  title,
  accountsLabel,
  classesLabel,
  liveStreamingLabel,
  liveEnabledLabel,
  liveStoppedLabel,
}: Props) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {institutes.map((inst) => {
        const perms = instPermissions[inst.id] || { accounts: true, classes: true };
        const isLiveOn = isLiveStreamingEnabled(inst.id);
        return (
          <View key={inst.id} style={styles.permCard}>
            <View style={styles.permHeader}>
              <View style={[styles.instituteIcon, (inst as any).type === 'school' ? { backgroundColor: '#FFF7ED' } : {}]}>
                <Ionicons
                  name={(inst as any).type === 'school' ? 'school' : 'business'}
                  size={18}
                  color={(inst as any).type === 'school' ? '#B45309' : Colors.primary}
                />
              </View>
              <Text style={styles.permInstName}>{inst.name}</Text>
            </View>
            <View style={styles.permRow}>
              <Switch
                value={perms.accounts}
                onValueChange={() => onTogglePermission(inst.id, 'accounts')}
                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                thumbColor={perms.accounts ? Colors.primary : '#94A3B8'}
              />
              <Text style={styles.permLabel}>{accountsLabel}</Text>
            </View>
            <View style={styles.permRow}>
              <Switch
                value={perms.classes}
                onValueChange={() => onTogglePermission(inst.id, 'classes')}
                trackColor={{ false: '#E2E8F0', true: '#818CF8' }}
                thumbColor={perms.classes ? Colors.primary : '#94A3B8'}
              />
              <Text style={styles.permLabel}>{classesLabel}</Text>
            </View>
            <View style={[styles.permRow, { borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
              <Switch
                value={isLiveOn}
                onValueChange={(val) => onToggleLiveStreaming(inst.id, val)}
                trackColor={{ false: '#E2E8F0', true: '#F87171' }}
                thumbColor={isLiveOn ? '#EF4444' : '#94A3B8'}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="videocam" size={16} color={isLiveOn ? '#EF4444' : Colors.textMuted} />
                <Text style={[styles.permLabel, isLiveOn && { color: '#EF4444', fontWeight: '800' }]}>
                  {liveStreamingLabel} {isLiveOn ? `(${liveEnabledLabel})` : `(${liveStoppedLabel})`}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}
