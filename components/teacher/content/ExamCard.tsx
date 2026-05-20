import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { styles } from './styles';

export interface ExamCardProps {
  item: any;
  statusColors: Record<string, { bg: string; text: string; label: string }>;
  onOpen: (item: any) => void;
  onSchedule: (item: any) => void;
  onShowReport: (item: any) => void;
  onToggleVisibility: (item: any) => void;
  onDelete: (item: any) => void;
}

export default function ExamCard({
  item,
  statusColors,
  onOpen,
  onSchedule,
  onShowReport,
  onToggleVisibility,
  onDelete,
}: ExamCardProps) {
  const status = statusColors[item.status] || statusColors.draft;
  let questions: any[] = [];
  try {
    questions =
      typeof item.questions === 'string' ? JSON.parse(item.questions || '[]') : item.questions || [];
  } catch {
    questions = [];
  }

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={() => onOpen(item)}>
      <View style={styles.examRow}>
        <LinearGradient colors={tokens.gradient.purple} style={styles.examTile}>
          <Ionicons name="flask" size={20} color="#fff" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={styles.examTitle}>{item.title}</Text>
          <View style={styles.examMeta}>
            <Text style={styles.examMetaText}>{questions.length} سؤال</Text>
            <Text style={styles.examMetaText}>{item.total_points || 0} درجة</Text>
            <Text style={styles.examMetaText}>{item.duration_minutes || 0} دقيقة</Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
          <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
        </View>
      </View>
      <View style={styles.examActions}>
        {item.status === 'draft' && (
          <TouchableOpacity
            style={[styles.examActionBtn, { backgroundColor: tokens.color.infoBg }]}
            onPress={() => onSchedule(item)}
          >
            <Ionicons name="calendar-outline" size={14} color={tokens.color.info} />
            <Text style={[styles.examActionText, { color: tokens.color.info }]}>جدولة</Text>
          </TouchableOpacity>
        )}
        {item.status === 'graded' && (
          <TouchableOpacity
            style={[styles.examActionBtn, { backgroundColor: tokens.color.successBg }]}
            onPress={() => onShowReport(item)}
          >
            <Ionicons name="document-text-outline" size={14} color={tokens.color.success} />
            <Text style={[styles.examActionText, { color: tokens.color.success }]}>تقرير النتائج</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.examActionBtn,
            { backgroundColor: item.is_hidden ? tokens.color.warningBg : tokens.color.successBg },
          ]}
          onPress={() => onToggleVisibility(item)}
        >
          <Ionicons
            name={item.is_hidden ? 'eye-off' : 'eye'}
            size={14}
            color={item.is_hidden ? tokens.color.orange : tokens.color.success}
          />
          <Text
            style={[
              styles.examActionText,
              { color: item.is_hidden ? tokens.color.orange : tokens.color.success },
            ]}
          >
            {item.is_hidden ? 'مخفي' : 'ظاهر'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.examActionBtn, { backgroundColor: tokens.color.dangerBg }]}
          onPress={(e) => {
            e.stopPropagation?.();
            onDelete(item);
          }}
        >
          <Ionicons name="trash-outline" size={14} color={tokens.color.danger} />
          <Text style={[styles.examActionText, { color: tokens.color.danger }]}>حذف</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}
