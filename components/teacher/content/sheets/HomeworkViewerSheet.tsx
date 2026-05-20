import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../../constants/colors';
import SwipeableSheet from '../../../shared/SwipeableSheet';

export interface HomeworkViewerSheetProps {
  visible: boolean;
  onClose: () => void;
  task: any | null;
  onOpenAttachment: (url: string) => void;
}

export default function HomeworkViewerSheet({
  visible,
  onClose,
  task,
  onOpenAttachment,
}: HomeworkViewerSheetProps) {
  return (
    <SwipeableSheet
      visible={visible}
      onClose={onClose}
      maxHeight={0.85}
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
          <Text style={{ flex: 1, fontSize: 16, fontWeight: '900', color: Colors.text, textAlign: 'right' }}>
            {task?.title || 'واجب'}
          </Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          {task?.description ? (
            <View style={{ backgroundColor: '#F8FAFC', padding: 14, borderRadius: 12, marginBottom: 12 }}>
              <Text style={{ fontSize: 13, color: Colors.text, textAlign: 'right', lineHeight: 22 }}>
                {task.description}
              </Text>
            </View>
          ) : null}
          {task?.due_date && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 12,
                justifyContent: 'flex-end',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#F59E0B' }}>
                {new Date(task.due_date).toLocaleDateString('ar-IQ')}
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted }}>الموعد:</Text>
              <Ionicons name="time-outline" size={16} color="#F59E0B" />
            </View>
          )}
          {task?.attachment_url && (
            <TouchableOpacity
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                backgroundColor: '#EEF2FF',
                padding: 14,
                borderRadius: 12,
              }}
              onPress={() => onOpenAttachment(task.attachment_url)}
            >
              <Ionicons name="attach" size={20} color={Colors.primary} />
              <Text
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: '800',
                  color: Colors.primary,
                  textAlign: 'right',
                }}
              >
                فتح المرفق
              </Text>
            </TouchableOpacity>
          )}
          {!task?.description && !task?.attachment_url && (
            <Text
              style={{
                fontSize: 13,
                color: Colors.textMuted,
                textAlign: 'center',
                marginTop: 20,
              }}
            >
              لا يوجد تفاصيل إضافية لهذا الواجب
            </Text>
          )}
        </ScrollView>
      </View>
    </SwipeableSheet>
  );
}
