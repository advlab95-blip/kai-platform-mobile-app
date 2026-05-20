import React from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../../constants/colors';
import { styles } from '../styles';

export interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  reportExam: any | null;
  reportLoading: boolean;
  reportSubmissions: any[];
  onShare: () => void;
}

export default function ReportModal({
  visible,
  onClose,
  reportExam,
  reportLoading,
  reportSubmissions,
  onShare,
}: ReportModalProps) {
  const { t } = useTranslation();
  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: Colors.border,
          }}
        >
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={{ fontSize: 16, fontWeight: '800', color: Colors.text }}>تقرير النتائج</Text>
          <TouchableOpacity onPress={onShare}>
            <Ionicons name="share-outline" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        {reportLoading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={Colors.primary} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            {reportExam && (
              <View style={[styles.card, { marginBottom: 16 }]}>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '800',
                    color: Colors.text,
                    textAlign: 'right',
                    marginBottom: 4,
                  }}
                >
                  {reportExam.title}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'right' }}>
                  إجمالي الدرجات: {reportExam.total_points || 0}
                </Text>
                <Text style={{ fontSize: 12, color: Colors.textMuted, textAlign: 'right' }}>
                  عدد المقدمين: {reportSubmissions.length}
                </Text>
              </View>
            )}
            {reportSubmissions.length === 0 ? (
              <Text style={styles.emptyText}>لا توجد إجابات مصححة</Text>
            ) : (
              reportSubmissions.map((sub: any, idx: number) => {
                const totalPts = reportExam?.total_points || 1;
                const pct = Math.round((sub.score / totalPts) * 100);
                const pctColor = pct >= 85 ? '#10B981' : pct >= 60 ? '#F59E0B' : '#EF4444';
                return (
                  <View key={sub.id || idx} style={[styles.card, { marginBottom: 8 }]}>
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: pctColor }}>{pct}%</Text>
                        <Text style={{ fontSize: 12, color: Colors.textMuted }}>
                          {sub.score}/{totalPts}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: '700',
                          color: Colors.text,
                          textAlign: 'right',
                        }}
                      >
                        {sub.users?.full_name || t('roles.student')}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={onShare}>
              <Ionicons name="share-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>مشاركة التقرير</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
