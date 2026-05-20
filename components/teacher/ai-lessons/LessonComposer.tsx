import React, { useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import { tokens } from '../../../constants/designTokens';
import { styles } from './styles';
import { buildSampleSuggestions } from './utils';

interface Props {
  sourceContent: string;
  onChangeContent: (v: string) => void;
  generating: boolean;
  generatingStage: string;
  teacherSubjects: string[];
  /** Grades the teacher is actually assigned to (e.g. "الخامس الابتدائي"). */
  teacherGrades?: string[];
  charCount: number;
  canGenerate: boolean;
  onGenerate: () => void;
}

export default function LessonComposer({
  sourceContent,
  onChangeContent,
  generating,
  generatingStage,
  teacherSubjects,
  teacherGrades,
  charCount,
  canGenerate,
  onGenerate,
}: Props) {
  // Suggestions are recomputed when subjects/grades change so the chips always
  // match the teacher's current scope (no stale prompts).
  const suggestions = useMemo(
    () => buildSampleSuggestions(teacherSubjects, teacherGrades),
    [teacherSubjects, teacherGrades],
  );
  return (
    <>
      {/* Composer — AI gradient header + textarea card. */}
      <LinearGradient
        colors={tokens.gradient.ai}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.composerHeader}
      >
        <Ionicons name="sparkles" size={18} color="#fff" />
        <Text style={styles.composerHeaderTitle}>اوصف الدرس اللي تريده</Text>
      </LinearGradient>
      <View style={styles.inputCard}>
        <View style={styles.inputLabelRow}>
          <Text style={styles.inputLabel}>المحتوى الخام</Text>
          {teacherSubjects.length > 0 && (
            <View style={styles.subjectBadge}>
              <Ionicons name="lock-closed" size={10} color="#0369A1" />
              <Text style={styles.subjectBadgeText}>
                ضمن: {teacherSubjects.join('، ')}
              </Text>
            </View>
          )}
        </View>
        <TextInput
          style={styles.inputArea}
          placeholder="الصق نص الدرس، أو اكتب موضوعاً، أو الصق ملخّص كتاب..."
          placeholderTextColor={Colors.textMuted}
          value={sourceContent}
          onChangeText={onChangeContent}
          multiline
          textAlign="right"
          textAlignVertical="top"
          editable={!generating}
        />

        {/* Char counter + sample hint */}
        <View style={styles.inputFooter}>
          <Text style={[styles.charCount, { color: charCount < 30 ? Colors.error : Colors.success }]}>
            {charCount} حرف
            {charCount < 30 && ' — (الحد الأدنى 30)'}
          </Text>
          <TouchableOpacity
            onPress={() => onChangeContent('')}
            disabled={!sourceContent || generating}
            style={{ opacity: sourceContent && !generating ? 1 : 0.3 }}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Sample prompts — tailored to teacher's subjects/grades when available. */}
        {charCount === 0 && suggestions.length > 0 && (
          <View style={styles.samplesBox}>
            <Text style={styles.samplesTitle}>
              {teacherSubjects.length > 0 ? 'مقترحات ضمن مادتك:' : 'مقترحات سريعة:'}
            </Text>
            <View style={styles.samplesChips}>
              {suggestions.map((p, i) => (
                <TouchableOpacity
                  key={`${i}-${p}`}
                  style={styles.sampleChip}
                  onPress={() => onChangeContent(p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.sampleChipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.generateBtn, !canGenerate && styles.generateBtnDisabled]}
          onPress={onGenerate}
          disabled={!canGenerate}
          activeOpacity={0.8}
        >
          {generating ? (
            <View style={styles.genRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.generateBtnText}>
                {generatingStage || 'جاري الإنشاء...'}
              </Text>
            </View>
          ) : (
            <View style={styles.genRow}>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <Text style={styles.generateBtnText}>إنشاء الدرس الكامل</Text>
            </View>
          )}
        </TouchableOpacity>

        {generating && (
          <Text style={styles.genHint}>
            قد يستغرق 20-40 ثانية لتوليد الأقسام + الصور
          </Text>
        )}
      </View>
    </>
  );
}
