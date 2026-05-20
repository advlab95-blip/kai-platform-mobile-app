// UserCodesSheet — list of users in the institute with the option to
// regenerate a login code. Plaintext codes are NEVER shown in the list;
// the only legitimate way to learn a code is to reset it, which surfaces
// the new value once in the parent's one-time copy modal.

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';
import { getRoleBadgeColor, getRoleName } from '../_helpers';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  visible: boolean;
  onClose: () => void;
  loadingUsers: boolean;
  instituteUsers: any[];
  resettingUserId: string | null;
  onResetCode: (userId: string) => void;
  title: string;
};

export default function UserCodesSheet({
  visible,
  onClose,
  loadingUsers,
  instituteUsers,
  resettingUserId,
  onResetCode,
  title,
}: Props) {
  return (
    <SwipeableSheet
      visible={visible}
      onClose={() => { if (!resettingUserId) onClose(); }}
      maxHeight={0.92}
    >
      <View style={styles.fullScreenContent}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{title}</Text>
        </View>

        <Text style={styles.securityNote}>
          الرموز محمية ولا يمكن عرضها. لإعطاء المستخدم رمزاً جديداً اضغط "إعادة إنشاء" — يظهر الرمز مرة واحدة فقط.
        </Text>

        {loadingUsers ? (
          <View style={{ alignItems: 'center', paddingVertical: 30 }}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={{ color: Colors.textMuted, marginTop: 8 }}>جاري التحميل...</Text>
          </View>
        ) : instituteUsers.length === 0 ? (
          <Text style={styles.emptyText}>لا يوجد مستخدمين</Text>
        ) : (
          <View style={{ height: SCREEN_HEIGHT * 0.66 }}>
            <FlashList
              data={instituteUsers}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 8 }}
              renderItem={({ item }) => {
                const busy = resettingUserId === item.id;
                return (
                  <View style={{ backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <TouchableOpacity
                        style={{
                          backgroundColor: Colors.primary,
                          borderRadius: 10,
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 6,
                          opacity: busy ? 0.6 : 1,
                        }}
                        onPress={() => onResetCode(item.id)}
                        disabled={!!resettingUserId}
                        accessibilityLabel="إعادة إنشاء كود"
                      >
                        {busy ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Ionicons name="refresh" size={14} color="#fff" />
                        )}
                        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                          إعادة إنشاء
                        </Text>
                      </TouchableOpacity>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: Colors.textMuted, fontFamily: 'monospace', letterSpacing: 2 }}>
                        ••••••
                      </Text>
                      <View style={{ flex: 1 }} />
                      <View style={{ backgroundColor: `${getRoleBadgeColor(item.role)}15`, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: getRoleBadgeColor(item.role) }}>
                          {getRoleName(item.role)}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: Colors.text }}>{item.name}</Text>
                    </View>
                  </View>
                );
              }}
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
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'right',
  },
  securityNote: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'right',
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    lineHeight: 18,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
    paddingVertical: 20,
  },
});
