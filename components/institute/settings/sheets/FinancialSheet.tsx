// FinancialSheet — list of students with cumulative paid total + per-row "تسديد" action
// to register a new payment. Pure presentational; parent owns Supabase + state.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  onClose: () => void;
  loadingPayments: boolean;
  studentPayments: any[];
  showPaymentInput: string | null;
  paymentAmount: string;
  processingPayment: boolean;
  onTogglePaymentInput: (id: string) => void;
  onChangePaymentAmount: (v: string) => void;
  onMakePayment: (studentId: string) => void;
  title: string;
};

export default function FinancialSheet({
  visible,
  onClose,
  loadingPayments,
  studentPayments,
  showPaymentInput,
  paymentAmount,
  processingPayment,
  onTogglePaymentInput,
  onChangePaymentAmount,
  onMakePayment,
  title,
}: Props) {
  return (
    <SwipeableSheet
      visible={visible}
      onClose={() => { if (!processingPayment) onClose(); }}
      maxHeight={0.92}
    >
      <View style={styles.fullScreenContent}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
        </View>

        {loadingPayments ? (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ color: Colors.textMuted, marginTop: 8 }}>جاري التحميل...</Text>
          </View>
        ) : studentPayments.length === 0 ? (
          <Text style={styles.emptyText}>لا يوجد طلاب مسجلين</Text>
        ) : (
          <View style={{ height: SCREEN_HEIGHT * 0.72 }}>
            <FlashList
              data={studentPayments}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: 8 }}
                renderItem={({ item }) => (
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <TouchableOpacity
                        style={{ backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6 }}
                        onPress={() => onTogglePaymentInput(item.id)}
                      >
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>تسديد</Text>
                      </TouchableOpacity>
                      <View style={{ flex: 1, alignItems: 'flex-end', marginRight: 8 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{item.name}</Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, fontWeight: '600' }}>
                          المدفوع: {item.totalPaid.toLocaleString()} د.ع
                        </Text>
                      </View>
                    </View>
                    {showPaymentInput === item.id && (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                        {(() => {
                          const parsedAmount = parseFloat(paymentAmount);
                          const isAmountInvalid = paymentAmount.trim() === '' || isNaN(parsedAmount) || parsedAmount <= 0;
                          const isDisabled = processingPayment || isAmountInvalid;
                          return (
                            <TouchableOpacity
                              style={[{ backgroundColor: Colors.success, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, justifyContent: 'center' }, isDisabled && { opacity: 0.6 }]}
                              onPress={() => onMakePayment(item.id)}
                              disabled={isDisabled}
                            >
                              {processingPayment ? (
                                <ActivityIndicator size="small" color="#fff" />
                              ) : (
                                <Ionicons name="checkmark" size={18} color="#fff" />
                              )}
                            </TouchableOpacity>
                          );
                        })()}
                        <TextInput
                          style={{ flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontWeight: '700', color: Colors.text, borderWidth: 1, borderColor: Colors.border, textAlign: 'center' }}
                          placeholder="المبلغ (د.ع)"
                          placeholderTextColor={Colors.textMuted}
                          value={paymentAmount}
                          onChangeText={onChangePaymentAmount}
                          keyboardType="numeric"
                        />
                      </View>
                    )}
                    {item.payments.length > 0 && (
                      <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 6 }}>
                        {item.payments.slice(0, 3).map((p: any, idx: number) => (
                          <View key={p.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                            <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                              {new Date(p.paid_at || p.created_at).toLocaleDateString('ar-IQ')}
                            </Text>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: Colors.success }}>
                              {p.amount?.toLocaleString()} د.ع
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              />
          </View>
        )}
      </View>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  fullScreenContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
