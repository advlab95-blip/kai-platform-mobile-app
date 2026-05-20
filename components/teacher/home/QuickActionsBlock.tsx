// QuickActionsBlock — "Quick Actions" section title + action row (notification +
// hall order) + the My Students and Class Chat full-width buttons. Parent owns
// each press handler.

import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';

type Props = {
  onSendNotificationPress: () => void;
  onHallPress: () => void;
  onStudentsPress: () => void;
  onChatListPress: () => void;
};

export default function QuickActionsBlock({
  onSendNotificationPress,
  onHallPress,
  onStudentsPress,
  onChatListPress,
}: Props) {
  const { t } = useTranslation();
  return (
    <>
      <Text style={styles.sectionTitle}>{t('teacherHome.quickActions')}</Text>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#FEF3C7' }]}
          onPress={onSendNotificationPress}
          activeOpacity={0.8}
        >
          <Ionicons name="notifications" size={22} color="#D97706" />
          <Text style={[styles.actionBtnText, { color: '#92400E' }]}>{t('teacherHome.sendNotification')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#FFEDD5' }]}
          onPress={onHallPress}
          activeOpacity={0.8}
        >
          <Ionicons name="cafe" size={22} color="#EA580C" />
          <Text style={[styles.actionBtnText, { color: '#9A3412' }]}>{t('teacherHome.hallOrder')}</Text>
        </TouchableOpacity>
      </View>

      {/* My Students — pick class → view students → grades/attendance/messaging */}
      <TouchableOpacity
        style={{ backgroundColor: '#ECFEFF', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 }}
        onPress={onStudentsPress}
        activeOpacity={0.8}
      >
        <Ionicons name="people" size={22} color="#0891B2" />
        <Text style={{ fontSize: 14, fontWeight: '800', color: '#0891B2' }}>{t('teacherHome.myStudents', { defaultValue: 'طلابي' })}</Text>
      </TouchableOpacity>

      {/* Chat with Students */}
      <TouchableOpacity
        style={{ backgroundColor: '#EEF2FF', borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 }}
        onPress={onChatListPress}
        activeOpacity={0.8}
      >
        <Ionicons name="chatbubbles" size={22} color={Colors.primary} />
        <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.primary }}>{t('teacherHome.classChat')}</Text>
      </TouchableOpacity>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: tokens.color.text,
    textAlign: 'right',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 20,
    padding: 18,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
});
