// InstituteLoadingGate — shown while detectInstitute() resolves. After 10s, exposes retry/logout.
// Prevents the previous infinite-spinner trap when the institute can't be detected.

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/colors';

type Props = {
  userId: string | null;
  onDetect: (uid: string) => Promise<void>;
  onLogout: () => void;
};

export default function InstituteLoadingGate({ userId, onDetect, onLogout }: Props) {
  const [showEscape, setShowEscape] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowEscape(true), 10000);
    return () => clearTimeout(t);
  }, []);

  const handleRetry = async () => {
    if (!userId) return;
    setRetrying(true);
    try { await onDetect(userId); } catch {}
    setRetrying(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={{ fontSize: 14, color: Colors.textMuted, marginTop: 12 }}>جاري تحميل بيانات المؤسسة...</Text>
      {showEscape && (
        <View style={{ marginTop: 28, alignItems: 'center', gap: 10, width: '100%', maxWidth: 320 }}>
          <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', lineHeight: 20 }}>
            يبدو أن التحميل يأخذ وقتاً أطول من المعتاد. حاول مرة أخرى أو سجّل خروج ثم ادخل من جديد.
          </Text>
          <TouchableOpacity
            onPress={handleRetry}
            disabled={retrying}
            style={{ width: '100%', backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center', opacity: retrying ? 0.6 : 1 }}
          >
            {retrying ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>إعادة المحاولة</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onLogout}
            style={{ width: '100%', backgroundColor: '#FEE2E2', borderRadius: 12, paddingVertical: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#DC2626', fontWeight: '800', fontSize: 14 }}>تسجيل الخروج</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
