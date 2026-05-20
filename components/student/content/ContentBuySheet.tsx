// ContentBuySheet — booklet reservation sheet (presentational).
// Parent owns the open state, the selected material, the phone field, and the submit handler.

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { tokens } from '../../../constants/designTokens';
import { haptics } from '../../../utils/haptics';
import SwipeableSheet from '../../shared/SwipeableSheet';
import KeyboardAwareScroll from '../../shared/KeyboardAwareScroll';

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedMaterial: any | null;
  userName?: string | null;
  buyerPhone: string;
  onChangePhone: (v: string) => void;
  buying: boolean;
  onConfirm: () => void;
};

export default function ContentBuySheet({
  visible,
  onClose,
  selectedMaterial,
  userName,
  buyerPhone,
  onChangePhone,
  buying,
  onConfirm,
}: Props) {
  return (
    <SwipeableSheet visible={visible} onClose={onClose} maxHeight={0.85}>
      <KeyboardAwareScroll contentContainerStyle={styles.sheetBody}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => { haptics.light(); onClose(); }}>
            <Ionicons name="close" size={24} color={tokens.color.text} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>حجز ملزمة</Text>
        </View>
        {selectedMaterial && (
          <View style={styles.buyConfirm}>
            {selectedMaterial.cover_url ? (
              <Image source={{ uri: selectedMaterial.cover_url }} style={{ width: 80, height: 80, borderRadius: tokens.radius.md }} contentFit="cover" cachePolicy="memory-disk" transition={200} />
            ) : (
              <Ionicons name="document-attach" size={40} color={tokens.color.teal600} />
            )}
            <Text style={styles.buyConfirmTitle}>{selectedMaterial.title}</Text>
            <Text style={styles.buyConfirmPrice}>
              {selectedMaterial.price ? `${selectedMaterial.price} د.ع — كاش عند الاستلام` : 'مجاني'}
            </Text>
          </View>
        )}
        <View style={{ gap: 8, marginBottom: 14 }}>
          <View style={styles.inputRow}>
            <Text style={styles.inputValue}>{userName || 'طالب'}</Text>
            <Ionicons name="person" size={16} color={tokens.color.text3} />
          </View>
          <TextInput
            style={styles.phoneInput}
            placeholder="رقم الهاتف"
            placeholderTextColor={tokens.color.text3}
            value={buyerPhone}
            onChangeText={onChangePhone}
            keyboardType="phone-pad"
          />
        </View>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => { haptics.light(); onConfirm(); }}
          disabled={buying || !buyerPhone.trim()}
          style={[styles.confirmBuyWrap, (buying || !buyerPhone.trim()) && { opacity: 0.6 }]}
        >
          <LinearGradient
            colors={tokens.gradient.student}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.confirmBuyBtn}
          >
            {buying ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="bookmark" size={18} color="#fff" />
                <Text style={styles.confirmBuyText}>حجز — التسديد كاش عند الاستلام</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </KeyboardAwareScroll>
    </SwipeableSheet>
  );
}

const styles = StyleSheet.create({
  sheetBody: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.text,
  },
  buyConfirm: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
  },
  buyConfirmTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'center',
  },
  buyConfirmPrice: {
    fontSize: 20,
    fontWeight: '900',
    color: tokens.color.teal700,
  },
  inputRow: {
    backgroundColor: tokens.color.surface2,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputValue: {
    flex: 1,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.text,
    writingDirection: 'rtl',
  },
  phoneInput: {
    backgroundColor: tokens.color.bg,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '700',
    color: tokens.color.text,
    textAlign: 'right',
  },
  confirmBuyWrap: {
    borderRadius: tokens.radius.md,
    overflow: 'hidden',
    ...tokens.shadow.teal,
  },
  confirmBuyBtn: {
    borderRadius: tokens.radius.md,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  confirmBuyText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
});
