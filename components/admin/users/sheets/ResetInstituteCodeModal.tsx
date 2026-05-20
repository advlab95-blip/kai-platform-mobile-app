import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';

type Props = {
  visible: boolean;
  resetCodeValue: string;
  resettingCode: boolean;
  // Active code currently in use by the institute admin. null = still loading;
  // '' = the institute has no admin account (so no code to display).
  currentCode?: string | null;
  loadingCurrentCode?: boolean;
  onChangeValue: (v: string) => void;
  onClose: () => void;
  onRegenerate: () => void;
  onConfirm: () => void;
  onCopyCurrent?: () => void;
  // Labels
  titleLabel: string;
  descLabel: string;
  cancelLabel: string;
  confirmLabel: string;
};

export default function ResetInstituteCodeModal({
  visible,
  resetCodeValue,
  resettingCode,
  currentCode,
  loadingCurrentCode,
  onChangeValue,
  onClose,
  onRegenerate,
  onConfirm,
  onCopyCurrent,
  titleLabel,
  descLabel,
  cancelLabel,
  confirmLabel,
}: Props) {
  return (
    <SwipeableSheet
      visible={visible}
      onClose={onClose}
      maxHeight={0.65}
      minHeight={0.5}
      overlayTapDisabled={resettingCode}
      swipeDownDisabled={resettingCode}
    >
      <View style={{ paddingHorizontal: 20, paddingBottom: 20, paddingTop: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text, textAlign: 'right', marginBottom: 6 }}>
          {titleLabel}
        </Text>
        <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginBottom: 14 }}>
          {descLabel}
        </Text>

        {/* Current code panel — visible first so the admin can SEE the active
            code before deciding to rotate it. Tap-to-copy for handing it off
            to the institute owner without retyping. */}
        <View style={{
          backgroundColor: '#EFF6FF',
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#BFDBFE',
          paddingHorizontal: 14,
          paddingVertical: 12,
          marginBottom: 14,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8', textAlign: 'right', marginBottom: 6 }}>
            الرمز الحالي
          </Text>
          {loadingCurrentCode ? (
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 4 }}>
              <ActivityIndicator size="small" color="#2563EB" />
            </View>
          ) : currentCode ? (
            <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: 8 }}>
              <Text style={{
                flex: 1,
                fontSize: 20,
                fontWeight: '900',
                color: '#1E3A8A',
                textAlign: 'center',
                letterSpacing: 4,
              }} selectable>
                {currentCode}
              </Text>
              {!!onCopyCurrent && (
                <TouchableOpacity
                  onPress={onCopyCurrent}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: '#DBEAFE' }}
                  accessibilityLabel="نسخ الرمز"
                >
                  <Ionicons name="copy-outline" size={16} color="#1D4ED8" />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <Text style={{ fontSize: 13, color: '#7F1D1D', textAlign: 'right' }}>
              لا يوجد حساب إدارة فعّال لهذه المؤسسة
            </Text>
          )}
        </View>

        {/* New code input + regenerate */}
        <Text style={{ fontSize: 11, fontWeight: '700', color: Colors.textMuted, textAlign: 'right', marginBottom: 6 }}>
          الرمز الجديد
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            onPress={onRegenerate}
            style={{ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9' }}
            accessibilityLabel="توليد رمز عشوائي"
          >
            <Ionicons name="refresh" size={18} color={Colors.primary} />
          </TouchableOpacity>
          <TextInput
            style={{
              flex: 1,
              backgroundColor: '#F8FAFC',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              fontSize: 16,
              fontWeight: '800',
              color: Colors.text,
              textAlign: 'center',
              borderWidth: 1,
              borderColor: '#E2E8F0',
              letterSpacing: 2,
            }}
            value={resetCodeValue}
            onChangeText={(v) => onChangeValue(v.toUpperCase())}
            autoCapitalize="characters"
            maxLength={10}
            placeholder="اكتب أو ولّد"
            placeholderTextColor="#94A3B8"
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <TouchableOpacity
            style={{ flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' }}
            onPress={onClose}
            disabled={resettingCode}
          >
            <Text style={{ fontSize: 14, fontWeight: '700', color: Colors.textMuted }}>{cancelLabel}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: '#7C3AED',
              alignItems: 'center',
              opacity: (resetCodeValue.trim().length >= 6 && !resettingCode) ? 1 : 0.5,
            }}
            onPress={onConfirm}
            disabled={resetCodeValue.trim().length < 6 || resettingCode}
          >
            {resettingCode ? <ActivityIndicator color="#fff" /> : (
              <Text style={{ fontSize: 14, fontWeight: '800', color: '#fff' }}>{confirmLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SwipeableSheet>
  );
}
