import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import useConnectivityStore from '../../stores/connectivityStore';

type Variant = 'offline' | 'slow' | 'syncing' | 'pending';

export default function OfflineBanner() {
  const { isConnected, connectionStrength, pendingCount, isSyncing, syncNow } = useConnectivityStore();

  // 'slow' variant removed — it appeared on every minor latency blip and
  // covered the top of the app for no actionable reason. The user already
  // sees inline loading spinners for slow ops. Keep only banners that
  // demand action (offline / pending sync) or visible activity (syncing).
  let variant: Variant | null = null;
  if (!isConnected) variant = 'offline';
  else if (isSyncing) variant = 'syncing';
  else if (pendingCount > 0) variant = 'pending';

  if (!variant) return null;

  const icon =
    variant === 'offline' ? 'cloud-offline' :
    variant === 'slow' ? 'cellular-outline' :
    variant === 'syncing' ? 'sync' : 'cloud-upload-outline';

  const text =
    variant === 'offline' ? 'لا يوجد اتصال — البيانات المحفوظة محلياً' :
    variant === 'slow' ? 'الاتصال ضعيف — جاري إعادة المحاولة…' :
    variant === 'syncing' ? 'جاري مزامنة البيانات...' :
    `${pendingCount} عملية معلقة`;

  return (
    <View
      style={[s.container, s[variant]]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={text}
    >
      <View style={s.content}>
        <Ionicons name={icon as any} size={16} color="#fff" />
        <Text style={s.text}>{text}</Text>
      </View>

      {variant === 'pending' && (
        <TouchableOpacity
          onPress={syncNow}
          style={s.syncBtn}
          accessibilityRole="button"
          accessibilityLabel="مزامنة العمليات المعلقة الآن"
        >
          <Text style={s.syncText}>مزامنة</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  offline: {
    backgroundColor: '#EF4444',
  },
  slow: {
    backgroundColor: '#F59E0B',
  },
  syncing: {
    backgroundColor: '#3B82F6',
  },
  pending: {
    backgroundColor: '#F59E0B',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  syncBtn: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  syncText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
});
