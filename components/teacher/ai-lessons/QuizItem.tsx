import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { styles } from './styles';
import { str } from './utils';

/**
 * Quiz item with tap-to-reveal. Students aren't shown the answer until they pick —
 * teachers see the answer highlighted so they can verify quality before publishing.
 */
export default function QuizItem({ index, item }: { index: number; item: any }) {
  const [selected, setSelected] = useState<number | null>(null);
  const revealed = selected !== null;
  const options: any[] = Array.isArray(item?.options) ? item.options : [];
  const correctIndex = typeof item?.correctIndex === 'number' ? item.correctIndex : -1;

  return (
    <View style={styles.quizBox}>
      <Text style={styles.quizQ}>{index + 1}. {str(item?.question)}</Text>
      <View style={{ gap: 6 }}>
        {options.map((opt, i) => {
          const isCorrect = i === correctIndex;
          const isPicked = selected === i;
          const showCorrect = revealed && isCorrect;
          const showWrong = revealed && isPicked && !isCorrect;
          return (
            <TouchableOpacity
              key={i}
              style={[
                styles.quizOpt,
                showCorrect && styles.quizOptCorrect,
                showWrong && styles.quizOptWrong,
              ]}
              onPress={() => !revealed && setSelected(i)}
              disabled={revealed}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.quizOptText,
                (showCorrect || showWrong) && { color: '#fff', fontWeight: '800' },
              ]}>
                {String.fromCharCode(65 + i)}. {str(opt)}
              </Text>
              {showCorrect && <Ionicons name="checkmark-circle" size={16} color="#fff" />}
              {showWrong && <Ionicons name="close-circle" size={16} color="#fff" />}
            </TouchableOpacity>
          );
        })}
      </View>
      {revealed && item?.explanation && (
        <View style={styles.explainBox}>
          <Ionicons name="information-circle-outline" size={14} color="#6366F1" />
          <Text style={styles.explainText}>{str(item.explanation)}</Text>
        </View>
      )}
    </View>
  );
}
