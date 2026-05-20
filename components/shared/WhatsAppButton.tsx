import React from 'react';
import { TouchableOpacity, Linking, Alert, ViewStyle, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Size = 'sm' | 'md';

interface Props {
  phone?: string | null;
  size?: Size;
  message?: string;
  style?: ViewStyle;
}

// Strip non-digits, add Iraq country code (964), drop leading 0.
// Returns null if the phone cannot be normalized into a 12-digit Iraqi number.
function toWhatsAppNumber(raw: string): string | null {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  if (/^964\d{10}$/.test(digits)) return digits;
  if (/^07[3-9]\d{8}$/.test(digits)) return '964' + digits.slice(1);
  if (/^7[3-9]\d{8}$/.test(digits)) return '964' + digits;
  return null;
}

export default function WhatsAppButton({ phone, size = 'sm', message, style }: Props) {
  if (!phone) return null;
  const normalized = toWhatsAppNumber(phone);
  if (!normalized) return null;

  const dim = size === 'md' ? 36 : 28;
  const icon = size === 'md' ? 20 : 15;

  const open = async () => {
    const text = message ? `?text=${encodeURIComponent(message)}` : '';
    const url = `https://wa.me/${normalized}${text}`;
    try {
      if (Platform.OS === 'web') {
        window.open(url, '_blank');
        return;
      }
      const can = await Linking.canOpenURL(url);
      if (!can) {
        Alert.alert('واتساب غير متوفر', 'لا يمكن فتح واتساب على هذا الجهاز.');
        return;
      }
      await Linking.openURL(url);
    } catch (err: any) {
      Alert.alert('خطأ', err?.message || 'تعذّر فتح واتساب');
    }
  };

  return (
    <TouchableOpacity
      onPress={(e: any) => { e?.stopPropagation?.(); open(); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={[{
        width: dim,
        height: dim,
        borderRadius: dim / 2,
        backgroundColor: '#25D366',
        alignItems: 'center',
        justifyContent: 'center',
      }, style]}
      accessibilityLabel="فتح محادثة واتساب"
    >
      <Ionicons name="logo-whatsapp" size={icon} color="#fff" />
    </TouchableOpacity>
  );
}
