import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { styles } from '../_styles';

type Props = {
  visible: boolean;
  onClose: () => void;
  internalTransferUser: any;
  internalTransferInstId: string;
  internalTransferTarget: string;
  internalTransferGrade: string;
  internalTransferring: boolean;
  institutes: any[];
  instStructureCache: Record<string, any>;
  roleLabelFor: (role: string) => string;
  onSelectGrade: (gradeId: string) => void;
  onSelectTarget: (id: string) => void;
  onConfirm: () => void;
  // Labels
  cancelLabel: string;
  confirmTransferLabel: string;
};

export default function InternalTransferSheet({
  visible,
  onClose,
  internalTransferUser,
  internalTransferInstId,
  internalTransferTarget,
  internalTransferGrade,
  internalTransferring,
  institutes,
  instStructureCache,
  roleLabelFor,
  onSelectGrade,
  onSelectTarget,
  onConfirm,
  cancelLabel,
  confirmTransferLabel,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={styles.sheetBody}>
        <Text style={styles.modalTitle}>
          نقل {internalTransferUser?.role === 'teacher' ? 'الأستاذ' : 'الطالب'} داخلياً
        </Text>

        {internalTransferUser && (
          <View style={{ backgroundColor: '#F0F9FF', borderRadius: 12, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.primary, textAlign: 'right' }}>
              {internalTransferUser.full_name}
            </Text>
            <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 2 }}>
              {roleLabelFor(internalTransferUser.role)}
            </Text>
          </View>
        )}

        {(() => {
          const structure = instStructureCache[internalTransferInstId];
          const inst = institutes.find(i => i.id === internalTransferInstId);
          const isSchool = (inst as any)?.type === 'school';

          if (!isSchool) {
            const groups = structure?.classes || [];
            return (
              <View>
                <Text style={styles.fieldLabel}>اختر الكروب الجديد</Text>
                <ScrollView style={{ maxHeight: 250 }}>
                  {groups.map((g: any) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.wizardOption, internalTransferTarget === g.id && styles.wizardOptionActive]}
                      onPress={() => onSelectTarget(g.id)}
                    >
                      <Text style={[styles.wizardOptionText, internalTransferTarget === g.id && styles.wizardOptionTextActive]}>{g.name}</Text>
                      <Ionicons name="people" size={16} color={internalTransferTarget === g.id ? Colors.primary : Colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          } else {
            const stages = (structure?.stages || []).sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0));
            const grades = structure?.grades || [];
            const sections = structure?.sections || [];
            const sortedGrades: any[] = [];
            for (const st of stages) {
              sortedGrades.push(...grades.filter((g: any) => g.stage_id === st.id).sort((a: any, b: any) => (a.order_num || 0) - (b.order_num || 0)));
            }
            return (
              <View>
                <Text style={styles.fieldLabel}>اختر الصف</Text>
                <ScrollView style={{ maxHeight: 150, marginBottom: 12 }}>
                  {sortedGrades.map((g: any) => (
                    <TouchableOpacity
                      key={g.id}
                      style={[styles.wizardOption, { paddingVertical: 10 }, internalTransferGrade === g.id && styles.wizardOptionActive]}
                      onPress={() => onSelectGrade(g.id)}
                    >
                      <Ionicons name={internalTransferGrade === g.id ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={internalTransferGrade === g.id ? Colors.primary : '#CBD5E1'} />
                      <Text style={[styles.wizardOptionText, { fontSize: 12 }, internalTransferGrade === g.id && styles.wizardOptionTextActive]}>{g.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {internalTransferGrade && (
                  <>
                    <Text style={styles.fieldLabel}>اختر الشعبة</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        {sections.filter((s: any) => s.grade_id === internalTransferGrade).map((s: any) => (
                          <TouchableOpacity
                            key={s.id}
                            style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: internalTransferTarget === s.id ? '#ECFDF5' : '#F8FAFC', borderWidth: 1.5, borderColor: internalTransferTarget === s.id ? '#059669' : '#E2E8F0' }}
                            onPress={() => onSelectTarget(s.id)}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: internalTransferTarget === s.id ? '#059669' : Colors.text }}>{s.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </ScrollView>
                  </>
                )}
              </View>
            );
          }
        })()}

        <View style={styles.modalBtnRow}>
          <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
            <Text style={styles.modalCancelText}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modalConfirmBtn, (!internalTransferTarget || internalTransferring) && { opacity: 0.4 }]}
            onPress={onConfirm}
            disabled={!internalTransferTarget || internalTransferring}
          >
            {internalTransferring ? (
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
