import React from 'react';
import { View, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { tokens } from '../../../constants/designTokens';
import { styles } from './styles';

const FEATURE_CHIPS = [
  { icon: 'compass-outline', label: 'أهداف' },
  { icon: 'document-text-outline', label: 'ملخّص' },
  { icon: 'images-outline', label: 'صور AI' },
  { icon: 'git-branch-outline', label: 'خريطة ذهنية' },
  { icon: 'help-circle-outline', label: 'كويز' },
  { icon: 'card-outline', label: 'بطاقات' },
];

export default function AILessonsHero() {
  return (
    /* Hero — uses tokens.gradient.ai so it matches every other AI surface. */
    <LinearGradient
      colors={tokens.gradient.ai}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.hero}
    >
      <View style={{ alignItems: 'center', gap: 10 }}>
        <View style={styles.sparkleRow}>
          <Ionicons name="sparkles" size={24} color="#FFD700" />
          <Ionicons name="bulb" size={28} color="#FFD700" />
          <Ionicons name="sparkles" size={24} color="#FFD700" />
        </View>
        <Text style={styles.heroTitle}>مولّد دروس ذكي</Text>
        <Text style={styles.heroSubtitle}>
          ضع أي محتوى — نحوّله لدرس كامل: أهداف، ملخّص، رسوم SVG، خريطة ذهنية، كويز، بطاقات
        </Text>
      </View>

      {/* Feature chips */}
      <View style={styles.chipsRow}>
        {FEATURE_CHIPS.map((c, i) => (
          <View key={i} style={styles.chip}>
            <Ionicons name={c.icon as any} size={12} color="#fff" />
            <Text style={styles.chipText}>{c.label}</Text>
          </View>
        ))}
      </View>
    </LinearGradient>
  );
}
