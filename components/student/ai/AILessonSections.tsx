// AILessonSections — pure read-only display blocks for an expanded AI lesson:
// objectives, summary, key stats, mind map, infographics, concepts, flashcards, examples, FAQ, further reading.

import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { tokens } from '../../../constants/designTokens';
import MindMap from '../../shared/MindMap';
import InfographicCard from '../../shared/InfographicCard';
import { s } from './_helpers';

type Props = {
  item: any;
  flashcards: any[];
};

export default function AILessonSections({ item, flashcards }: Props) {
  const { t } = useTranslation();

  return (
    <>
      {/* 🎯 Objectives */}
      {Array.isArray(item.objectives) && item.objectives.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>🎯 أهداف التعلّم</Text>
          {item.objectives.map((o: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingVertical: 3, justifyContent: 'flex-end' }}>
              <Text style={{ flex: 1, fontSize: 12, color: tokens.color.text, textAlign: 'right', lineHeight: 20 }}>{s(o)}</Text>
              <Text style={{ color: tokens.color.purple, fontWeight: '800' }}>•</Text>
            </View>
          ))}
        </View>
      )}

      {/* Summary */}
      {item.summary && s(item.summary) !== '' && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>{t('student.summaryLabel')}</Text>
          <Text style={styles.summaryText}>{s(item.summary)}</Text>
        </View>
      )}

      {/* 📊 Key Stats */}
      {Array.isArray(item.keyStats) && item.keyStats.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>📊 أرقام مفتاحية</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {item.keyStats.map((st: any, i: number) => (
              <View key={i} style={{
                flex: 1, minWidth: 100,
                backgroundColor: tokens.color.warningBg,
                borderRadius: tokens.radius.md, padding: 10, alignItems: 'center',
                borderWidth: 1, borderColor: '#FDE68A',
              }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: tokens.color.warning }}>{s(st?.value)}</Text>
                <Text style={{ fontSize: 10, color: '#92400E', textAlign: 'center' }}>{s(st?.label)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* 🗺️ Mind Map */}
      {item.mindMap && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>🗺️ خريطة ذهنية</Text>
          <MindMap root={item.mindMap} accentColor={tokens.color.purple} />
        </View>
      )}

      {/* 🖼️ Real AI images */}
      {Array.isArray(item.infographics) && item.infographics.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>🖼️ صور الدرس</Text>
          {item.infographics.map((g: any, i: number) => (
            <InfographicCard
              key={i}
              title={s(g?.title)}
              imagePrompt={s(g?.imagePrompt)}
              svg={s(g?.svg)}
              caption={s(g?.caption)}
              accentColor={tokens.color.info}
            />
          ))}
        </View>
      )}

      {/* 🔑 Concepts */}
      {Array.isArray(item.concepts) && item.concepts.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>🔑 مفاهيم رئيسية</Text>
          {item.concepts.map((c: any, i: number) => (
            <View key={i} style={{
              backgroundColor: tokens.color.pinkBg, borderRadius: tokens.radius.md, padding: 10,
              marginBottom: 6, borderWidth: 1, borderColor: '#FBCFE8',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: tokens.color.pink, textAlign: 'right' }}>{s(c?.term || c?.label)}</Text>
              <Text style={{ fontSize: 11, color: tokens.color.text, textAlign: 'right', lineHeight: 18, marginTop: 3 }}>{s(c?.definition || c?.description)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Flashcards — teal gradient per reference (was brand blue before). */}
      {flashcards.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>{t('student.flashcards')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {flashcards.map((card: any, idx: number) => (
              <LinearGradient
                key={idx}
                colors={tokens.gradient.teal as unknown as readonly [string, string, ...string[]]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.flashcard}
              >
                <Text style={styles.flashcardFront}>{s(card?.front || card?.question || card?.term || card?.label)}</Text>
                <View style={styles.flashcardDivider} />
                <Text style={styles.flashcardBack}>{s(card?.back || card?.answer || card?.definition || card?.description)}</Text>
              </LinearGradient>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 💡 Examples */}
      {Array.isArray(item.examples) && item.examples.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>💡 أمثلة تطبيقية</Text>
          {item.examples.map((e: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingVertical: 3, justifyContent: 'flex-end' }}>
              <Text style={{ flex: 1, fontSize: 12, color: tokens.color.text, textAlign: 'right', lineHeight: 20 }}>{s(e)}</Text>
              <Text style={{ color: tokens.color.success, fontWeight: '800' }}>◆</Text>
            </View>
          ))}
        </View>
      )}

      {/* ❓ FAQ */}
      {Array.isArray(item.faq) && item.faq.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>❓ أسئلة شائعة</Text>
          {item.faq.map((f: any, i: number) => (
            <View key={i} style={{
              backgroundColor: tokens.color.purpleBg, borderRadius: tokens.radius.md, padding: 10,
              marginBottom: 6, borderWidth: 1, borderColor: '#DDD6FE',
            }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: tokens.color.purple, textAlign: 'right', marginBottom: 4 }}>
                ❓ {s(f?.question)}
              </Text>
              <Text style={{ fontSize: 11, color: tokens.color.text, textAlign: 'right', lineHeight: 18 }}>
                {s(f?.answer)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* 📚 Further Reading */}
      {Array.isArray(item.furtherReading) && item.furtherReading.length > 0 && (
        <View style={styles.lessonSection}>
          <Text style={styles.sectionLabel}>📚 للتعمّق أكثر</Text>
          {item.furtherReading.map((r: any, i: number) => (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingVertical: 3, justifyContent: 'flex-end' }}>
              <Text style={{ flex: 1, fontSize: 12, color: tokens.color.text, textAlign: 'right', lineHeight: 20 }}>{s(r)}</Text>
              <Text style={{ color: tokens.color.info, fontWeight: '800' }}>→</Text>
            </View>
          ))}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  lessonSection: {
    marginTop: 14,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.color.purple,
    textAlign: 'right',
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 13,
    color: tokens.color.text2,
    textAlign: 'right',
    lineHeight: 22,
  },
  flashcard: {
    width: 210,
    borderRadius: tokens.radius.lg,
    padding: 16,
    marginRight: 10,
    minHeight: 130,
    justifyContent: 'center',
    ...tokens.shadow.teal,
  },
  flashcardFront: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'right',
  },
  flashcardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginVertical: 10,
  },
  flashcardBack: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'right',
    lineHeight: 18,
  },
});
