import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { styles } from '../_styles';

type DeleteMode = 'with_users' | 'institute_only' | null;

type Props = {
  visible: boolean;
  onClose: () => void;
  deleteInstTarget: any;
  deleteInstStep: 1 | 2;
  deleteInstMode: DeleteMode;
  deleteInstTransferTarget: string;
  deletingInst: boolean;
  institutes: any[];
  // Delegated to parent: keeps Supabase / institute_id logic out of children.
  getUsersForInstitute: (instId: string) => any[];
  onSetMode: (mode: DeleteMode) => void;
  onSetStep: (step: 1 | 2) => void;
  onSelectTransferTarget: (id: string) => void;
  onConfirmFullDelete: () => void;
  onConfirmTransferDelete: () => void;
  // Labels
  cancelLabel: string;
  nextLabel: string;
  backLabel: string;
};

export default function DeleteInstituteSheet({
  visible,
  onClose,
  deleteInstTarget,
  deleteInstStep,
  deleteInstMode,
  deleteInstTransferTarget,
  deletingInst,
  institutes,
  getUsersForInstitute,
  onSetMode,
  onSetStep,
  onSelectTransferTarget,
  onConfirmFullDelete,
  onConfirmTransferDelete,
  cancelLabel,
  nextLabel,
  backLabel,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <View style={styles.sheetBody}>
        <Text style={styles.modalTitle}>
          {deleteInstStep === 1
            ? 'حذف المعهد'
            : deleteInstMode === 'with_users'
            ? 'تأكيد الحذف الكامل'
            : 'نقل المستخدمين'}
        </Text>

        {deleteInstTarget && (
          <View style={{ backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.error, textAlign: 'right' }}>
              {deleteInstTarget.name}
            </Text>
            <Text style={{ fontSize: 12, color: '#B91C1C', textAlign: 'right', marginTop: 4 }}>
              {getUsersForInstitute(deleteInstTarget.id).length} مستخدم مسجل
            </Text>
          </View>
        )}

        {/* Step 1: Choose mode */}
        {deleteInstStep === 1 && (
          <View style={{ gap: 10 }}>
            <TouchableOpacity
              style={[styles.wizardOption, deleteInstMode === 'with_users' && { borderColor: Colors.error, backgroundColor: '#FEF2F2' }]}
              onPress={() => { if (__DEV__) console.log('[DELETE] mode: with_users'); onSetMode('with_users'); }}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.wizardOptionText, deleteInstMode === 'with_users' && { color: Colors.error }]}>
                  حذف المعهد مع كل الأساتذة والطلاب
                </Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 }}>
                  سيتم حذف جميع البيانات: حسابات، حضور، امتحانات، درجات، مواد، إشعارات...
                </Text>
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="nuclear" size={18} color={Colors.error} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.wizardOption, deleteInstMode === 'institute_only' && styles.wizardOptionActive]}
              onPress={() => onSetMode('institute_only')}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.wizardOptionText, deleteInstMode === 'institute_only' && styles.wizardOptionTextActive]}>
                  حذف المعهد فقط (نقل المستخدمين)
                </Text>
                <Text style={{ fontSize: 11, color: Colors.textMuted, textAlign: 'right', marginTop: 4 }}>
                  الأساتذة والطلاب يتنقلون لمعهد ثاني تختاره
                </Text>
              </View>
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="swap-horizontal" size={18} color={Colors.primary} />
              </View>
            </TouchableOpacity>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose}>
                <Text style={styles.modalCancelText}>{cancelLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !deleteInstMode && { opacity: 0.4 }]}
                onPress={() => {
                  if (!deleteInstMode) {
                    Alert.alert('تنبيه', 'اختر طريقة الحذف أولاً');
                    return;
                  }
                  onSetStep(2);
                }}
                disabled={!deleteInstMode}
              >
                <Text style={styles.modalConfirmText}>{nextLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2a: Confirm full delete */}
        {deleteInstStep === 2 && deleteInstMode === 'with_users' && (
          <View>
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#FECACA' }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#B91C1C', textAlign: 'right', lineHeight: 22 }}>
                سيتم حذف المعهد وجميع المستخدمين المسجلين فيه بالكامل، بما في ذلك:{'\n'}
                - حسابات الأساتذة والطلاب{'\n'}
                - سجلات الحضور والغياب{'\n'}
                - الامتحانات والدرجات{'\n'}
                - الواجبات والتسليمات{'\n'}
                - الجدول الدراسي{'\n'}
                - الإشعارات والإعلانات{'\n'}
                - المواد التعليمية والفيديوهات{'\n'}
                - السجلات الطبية وطلبات الكافتيريا
              </Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '900', color: Colors.error, textAlign: 'center', marginBottom: 16 }}>
              هذا الإجراء لا يمكن التراجع عنه!
            </Text>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => onSetStep(1)}>
                <Text style={styles.modalCancelText}>{backLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[{ flex: 1, paddingVertical: 14, borderRadius: 14, backgroundColor: Colors.error, alignItems: 'center' }, deletingInst && { opacity: 0.4 }]}
                onPress={onConfirmFullDelete}
                disabled={deletingInst}
              >
                {deletingInst ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>حذف الكل نهائياً</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Step 2b: Transfer users then delete institute */}
        {deleteInstStep === 2 && deleteInstMode === 'institute_only' && (
          <View>
            <Text style={[styles.fieldLabel, { marginBottom: 10 }]}>
              اختر المعهد الجديد لنقل ({getUsersForInstitute(deleteInstTarget?.id || '').length}) مستخدم:
            </Text>
            <ScrollView style={{ maxHeight: 200 }}>
              {institutes
                .filter((i) => i.id !== deleteInstTarget?.id)
                .map((inst) => (
                  <TouchableOpacity
                    key={inst.id}
                    style={[styles.wizardOption, deleteInstTransferTarget === inst.id && styles.wizardOptionActive]}
                    onPress={() => onSelectTransferTarget(inst.id)}
                  >
                    <Text style={{ fontSize: 11, color: Colors.textMuted }}>
                      {getUsersForInstitute(inst.id).length} مستخدم حالياً
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={[styles.wizardOptionText, deleteInstTransferTarget === inst.id && styles.wizardOptionTextActive]}>
                        {inst.name}
                      </Text>
                      <Ionicons name="business" size={16} color={deleteInstTransferTarget === inst.id ? Colors.primary : Colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                ))}
            </ScrollView>

            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => onSetStep(1)}>
                <Text style={styles.modalCancelText}>{backLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, (!deleteInstTransferTarget || deletingInst) && { opacity: 0.4 }]}
                onPress={onConfirmTransferDelete}
                disabled={!deleteInstTransferTarget || deletingInst}
              >
                {deletingInst ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.modalConfirmText}>نقل واحذف المعهد</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SwipeableSheet>
  );
}
