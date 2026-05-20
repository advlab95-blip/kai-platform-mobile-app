import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';

export interface ViewersSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  loading: boolean;
  viewers: any[];
}

export default function ViewersSheet({
  visible,
  onClose,
  title,
  loading,
  viewers,
}: ViewersSheetProps) {
  return (
    <SwipeableSheet
      visible={visible}
      onClose={onClose}
      maxHeight={0.8}
      sheetStyle={{ backgroundColor: Colors.background }}
    >
      <View style={{ flex: 1 }}>
        <View
          style={{
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <TouchableOpacity onPress={onClose} style={{ padding: 6 }}>
            <Ionicons name="close" size={22} color={Colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{ fontSize: 15, fontWeight: '900', color: Colors.text, textAlign: 'right' }}
            >
              المشاهدون ({viewers.length})
            </Text>
            <Text
              style={{
                fontSize: 11,
                color: Colors.textMuted,
                textAlign: 'right',
                marginTop: 2,
              }}
            >
              {title || ''}
            </Text>
          </View>
        </View>
        {loading ? (
          <ActivityIndicator style={{ padding: 40 }} color={Colors.primary} />
        ) : viewers.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Ionicons name="people-outline" size={48} color="#E2E8F0" />
            <Text style={{ fontSize: 13, color: Colors.textMuted, marginTop: 12 }}>
              لا يوجد مشاهدون بعد
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
            {viewers.map((v: any) => (
              <View
                key={v.student_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#fff',
                  padding: 12,
                  borderRadius: 12,
                  marginBottom: 6,
                  borderWidth: 1,
                  borderColor: Colors.border,
                }}
              >
                <Ionicons name="checkmark-circle" size={18} color="#059669" />
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '800',
                      color: Colors.text,
                      textAlign: 'right',
                    }}
                  >
                    {v.full_name}
                  </Text>
                  {(v.viewed_at || v.last_watched_at) && (
                    <Text
                      style={{
                        fontSize: 10,
                        color: Colors.textMuted,
                        textAlign: 'right',
                        marginTop: 2,
                      }}
                    >
                      {new Date(v.viewed_at || v.last_watched_at).toLocaleString('ar-IQ')}
                    </Text>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SwipeableSheet>
  );
}
