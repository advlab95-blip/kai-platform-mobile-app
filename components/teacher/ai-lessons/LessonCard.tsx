import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../../constants/colors';
import MindMap from '../../shared/MindMap';
import InfographicCard, { pollinationsUrl } from '../../shared/InfographicCard';
import { styles } from './styles';
import { str } from './utils';
import type { SavedLesson, LessonTab } from './types';
import SectionCard from './SectionCard';
import QuizItem from './QuizItem';
import Flashcard from './Flashcard';

/**
 * Individual lesson card. All rich sections render conditionally — legacy drafts with only
 * a summary still look clean. Extracted as a sub-component so expand/collapse state only
 * re-renders this card, not the whole list.
 */
export default function LessonCard({
  lesson,
  stats,
  isToggling,
  isDeleting,
  onToggle,
  onPublish,
  onDelete,
  onDuplicate,
  onExportPDF,
}: {
  lesson: SavedLesson;
  stats?: { attempts: number; uniqueStudents: number; avgScore: number };
  isToggling: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onPublish: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExportPDF: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [activeTab, setActiveTab] = useState<LessonTab>('overview');
  const d = lesson.data;
  const isPublished = lesson.status === 'published';

  // Preview thumbnail: use first infographic image so the collapsed card isn't just text.
  const firstImagePrompt = Array.isArray(d.infographics) && d.infographics[0]
    ? (d.infographics[0].imagePrompt || d.infographics[0].title || lesson.title)
    : lesson.title;
  const thumbUrl = firstImagePrompt ? pollinationsUrl(firstImagePrompt, 200, 150) : '';

  // Which tabs are populated — hide empty ones so the bar isn't cluttered.
  const hasOverview = !!(d.summary || d.objectives?.length || d.keyStats?.length);
  const hasContent = !!(d.concepts?.length || d.mindMap || d.infographics?.length || d.flashcards?.length || d.flashcardsLegacy?.length);
  const hasQuiz = !!(d.quiz?.length || d.quizLegacy?.length);
  const hasResources = !!(d.examples?.length || d.faq?.length || d.furtherReading?.length);

  const availableTabs: { key: LessonTab; label: string; icon: any }[] = [];
  if (hasOverview) availableTabs.push({ key: 'overview', label: 'نظرة عامة', icon: 'compass-outline' });
  if (hasContent) availableTabs.push({ key: 'content', label: 'المحتوى', icon: 'library-outline' });
  if (hasQuiz) availableTabs.push({ key: 'quiz', label: 'الأسئلة', icon: 'help-circle-outline' });
  if (hasResources) availableTabs.push({ key: 'resources', label: 'موارد', icon: 'bookmarks-outline' });

  return (
    <View style={styles.lessonCard}>
      <TouchableOpacity style={styles.lessonHead} onPress={onToggle} activeOpacity={0.85}>
        {/* Thumbnail */}
        {!!thumbUrl && (
          <View style={styles.lessonThumb}>
            <Image
              source={{ uri: thumbUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
            <View style={styles.lessonThumbOverlay} />
            <View style={styles.lessonThumbBadge}>
              <Ionicons name="sparkles" size={10} color="#fff" />
            </View>
          </View>
        )}

        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.lessonTitle} numberOfLines={2}>{lesson.title}</Text>

          {/* Meta row */}
          <View style={styles.lessonMeta}>
            <View style={[styles.statusBadge, { backgroundColor: isPublished ? '#D1FAE5' : '#FEF3C7' }]}>
              <Ionicons
                name={isPublished ? 'checkmark-circle' : 'time-outline'}
                size={10}
                color={isPublished ? '#059669' : '#92400E'}
              />
              <Text style={[styles.statusText, { color: isPublished ? '#059669' : '#92400E' }]}>
                {isPublished ? 'منشور' : 'مسودّة'}
              </Text>
            </View>
            <Text style={styles.lessonDate}>{lesson.date}</Text>
          </View>

          {/* Quick stats chips */}
          <View style={styles.quickStats}>
            {Array.isArray(d.quiz) && d.quiz.length > 0 && (
              <View style={styles.quickChip}>
                <Ionicons name="help-circle-outline" size={10} color="#B45309" />
                <Text style={styles.quickChipText}>{d.quiz.length} سؤال</Text>
              </View>
            )}
            {Array.isArray(d.flashcards) && d.flashcards.length > 0 && (
              <View style={styles.quickChip}>
                <Ionicons name="card-outline" size={10} color="#0369A1" />
                <Text style={styles.quickChipText}>{d.flashcards.length} بطاقة</Text>
              </View>
            )}
            {Array.isArray(d.infographics) && d.infographics.length > 0 && (
              <View style={styles.quickChip}>
                <Ionicons name="images-outline" size={10} color="#4338CA" />
                <Text style={styles.quickChipText}>{d.infographics.length} صورة</Text>
              </View>
            )}
          </View>
        </View>

        <Ionicons
          name={lesson.expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={Colors.textMuted}
        />
      </TouchableOpacity>

      {lesson.expanded && (
        <View style={styles.lessonBody}>
          {/* Engagement strip — only shows for published lessons that have at least one attempt. */}
          {lesson.status === 'published' && stats && stats.attempts > 0 && (
            <View style={styles.engagementRow}>
              <View style={styles.engagementBox}>
                <Ionicons name="people" size={14} color="#0369A1" />
                <Text style={styles.engagementValue}>{stats.uniqueStudents}</Text>
                <Text style={styles.engagementLabel}>طالب حاول</Text>
              </View>
              <View style={styles.engagementBox}>
                <Ionicons name="repeat" size={14} color="#7C3AED" />
                <Text style={styles.engagementValue}>{stats.attempts}</Text>
                <Text style={styles.engagementLabel}>محاولة</Text>
              </View>
              <View style={styles.engagementBox}>
                <Ionicons name="trophy" size={14} color={stats.avgScore >= 70 ? '#059669' : stats.avgScore >= 50 ? '#F59E0B' : '#DC2626'} />
                <Text style={[styles.engagementValue, { color: stats.avgScore >= 70 ? '#059669' : stats.avgScore >= 50 ? '#F59E0B' : '#DC2626' }]}>
                  {stats.avgScore}%
                </Text>
                <Text style={styles.engagementLabel}>معدل الدرجة</Text>
              </View>
            </View>
          )}

          {/* Tab bar */}
          {availableTabs.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabBar}
              style={{ marginHorizontal: -4 }}
            >
              {availableTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => setActiveTab(tab.key)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={tab.icon}
                      size={14}
                      color={isActive ? '#fff' : Colors.textMuted}
                    />
                    <Text style={[styles.tabLabel, isActive && { color: '#fff' }]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          {/* Tab content */}
          {activeTab === 'overview' && (
            <View style={{ gap: 10 }}>
              {Array.isArray(d.objectives) && d.objectives.length > 0 && (
                <SectionCard icon="compass-outline" title="أهداف التعلّم" color="#3B82F6">
                  {d.objectives.map((o: any, i: number) => (
                    <View key={i} style={styles.bullet}>
                      <Text style={styles.bulletDot}>•</Text>
                      <Text style={styles.bulletText}>{str(o)}</Text>
                    </View>
                  ))}
                </SectionCard>
              )}

              {d.summary && str(d.summary) !== '' && (
                <SectionCard icon="document-text-outline" title="الملخّص العميق" color={Colors.primary}>
                  <Text style={styles.summaryText}>{str(d.summary)}</Text>
                </SectionCard>
              )}

              {Array.isArray(d.keyStats) && d.keyStats.length > 0 && (
                <SectionCard icon="stats-chart-outline" title="أرقام مفتاحية" color="#F59E0B">
                  <View style={styles.statsGrid}>
                    {d.keyStats.map((s: any, i: number) => (
                      <View key={i} style={styles.statBox}>
                        <Text style={styles.statValue}>{str(s?.value)}</Text>
                        <Text style={styles.statLabel}>{str(s?.label)}</Text>
                      </View>
                    ))}
                  </View>
                </SectionCard>
              )}
            </View>
          )}

          {activeTab === 'content' && (
            <View style={{ gap: 10 }}>
              {Array.isArray(d.infographics) && d.infographics.length > 0 && (
                <SectionCard icon="images-outline" title="صور الدرس" color="#3B82F6">
                  {d.infographics.map((g, i) => (
                    <InfographicCard
                      key={i}
                      title={str(g?.title)}
                      imagePrompt={str(g?.imagePrompt)}
                      svg={str(g?.svg)}
                      caption={str(g?.caption)}
                      accentColor="#3B82F6"
                    />
                  ))}
                </SectionCard>
              )}

              {d.mindMap && (
                <SectionCard icon="git-branch-outline" title="خريطة ذهنية" color="#7C3AED">
                  <MindMap root={d.mindMap} accentColor="#7C3AED" />
                </SectionCard>
              )}

              {Array.isArray(d.concepts) && d.concepts.length > 0 && (
                <SectionCard icon="key-outline" title="المفاهيم الرئيسية" color="#EC4899">
                  {d.concepts.map((c: any, i: number) => (
                    <View key={i} style={styles.conceptBox}>
                      <Text style={styles.conceptTerm}>{str(c?.term || c?.label)}</Text>
                      <Text style={styles.conceptDef}>{str(c?.definition || c?.description)}</Text>
                    </View>
                  ))}
                </SectionCard>
              )}

              {Array.isArray(d.flashcards) && d.flashcards.length > 0 ? (
                <SectionCard icon="card-outline" title="بطاقات تعليمية" color={Colors.info}>
                  {d.flashcards.map((f: any, i: number) => {
                    const front = typeof f === 'string' ? f : (f?.front ?? f?.label ?? f?.term ?? '');
                    const back = typeof f === 'string' ? '' : (f?.back ?? f?.description ?? f?.definition ?? '');
                    return <Flashcard key={i} front={str(front)} back={str(back)} />;
                  })}
                </SectionCard>
              ) : Array.isArray(d.flashcardsLegacy) && d.flashcardsLegacy.length > 0 ? (
                <SectionCard icon="card-outline" title="بطاقات تعليمية" color={Colors.info}>
                  {d.flashcardsLegacy.map((f: any, i: number) => (
                    <View key={i} style={styles.legacyFlash}>
                      <Text style={styles.legacyFlashText}>{str(f)}</Text>
                    </View>
                  ))}
                </SectionCard>
              ) : null}
            </View>
          )}

          {activeTab === 'quiz' && (
            <View style={{ gap: 10 }}>
              {Array.isArray(d.quiz) && d.quiz.length > 0 ? (
                <SectionCard icon="help-circle-outline" title="كويز تفاعلي" color={Colors.warning}>
                  {d.quiz.map((q: any, i: number) => (
                    <QuizItem key={i} index={i} item={q} />
                  ))}
                </SectionCard>
              ) : Array.isArray(d.quizLegacy) && d.quizLegacy.length > 0 ? (
                <SectionCard icon="help-circle-outline" title="أسئلة" color={Colors.warning}>
                  {d.quizLegacy.map((q: any, i: number) => (
                    <Text key={i} style={styles.quizLegacyItem}>{i + 1}. {str(q)}</Text>
                  ))}
                </SectionCard>
              ) : null}
            </View>
          )}

          {activeTab === 'resources' && (
            <View style={{ gap: 10 }}>
              {Array.isArray(d.examples) && d.examples.length > 0 && (
                <SectionCard icon="bulb-outline" title="أمثلة تطبيقية" color="#10B981">
                  {d.examples.map((e: any, i: number) => (
                    <View key={i} style={styles.bullet}>
                      <Text style={styles.bulletDot}>◆</Text>
                      <Text style={styles.bulletText}>{str(e)}</Text>
                    </View>
                  ))}
                </SectionCard>
              )}

              {Array.isArray(d.faq) && d.faq.length > 0 && (
                <SectionCard icon="chatbox-ellipses-outline" title="أسئلة شائعة" color="#8B5CF6">
                  {d.faq.map((f: any, i: number) => (
                    <View key={i} style={styles.faqBox}>
                      <Text style={styles.faqQ}>❓ {str(f?.question)}</Text>
                      <Text style={styles.faqA}>{str(f?.answer)}</Text>
                    </View>
                  ))}
                </SectionCard>
              )}

              {Array.isArray(d.furtherReading) && d.furtherReading.length > 0 && (
                <SectionCard icon="book-outline" title="للتعمّق أكثر" color="#6366F1">
                  {d.furtherReading.map((r: any, i: number) => (
                    <View key={i} style={styles.bullet}>
                      <Text style={styles.bulletDot}>→</Text>
                      <Text style={styles.bulletText}>{str(r)}</Text>
                    </View>
                  ))}
                </SectionCard>
              )}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.deleteBtn]}
              onPress={onDelete}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#DC2626" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={16} color="#DC2626" />
                  <Text style={styles.deleteBtnText}>حذف</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.dupBtn]}
              onPress={async () => {
                setDuplicating(true);
                try { await onDuplicate(); } finally { setDuplicating(false); }
              }}
              disabled={duplicating}
              activeOpacity={0.8}
            >
              {duplicating ? (
                <ActivityIndicator size="small" color="#0369A1" />
              ) : (
                <>
                  <Ionicons name="copy-outline" size={16} color="#0369A1" />
                  <Text style={styles.dupBtnText}>نسخ</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.pdfBtn]}
              onPress={async () => {
                setExporting(true);
                try { await onExportPDF(); } finally { setExporting(false); }
              }}
              disabled={exporting}
              activeOpacity={0.8}
            >
              {exporting ? (
                <ActivityIndicator size="small" color="#B45309" />
              ) : (
                <>
                  <Ionicons name="document-outline" size={16} color="#B45309" />
                  <Text style={styles.pdfBtnText}>PDF</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.actionBtn,
                styles.publishBtn,
                { backgroundColor: isPublished ? '#F1F5F9' : Colors.success },
              ]}
              onPress={onPublish}
              disabled={isToggling}
              activeOpacity={0.8}
            >
              {isToggling ? (
                <ActivityIndicator size="small" color={isPublished ? Colors.textMuted : '#fff'} />
              ) : (
                <>
                  <Ionicons
                    name={isPublished ? 'eye-off-outline' : 'paper-plane-outline'}
                    size={16}
                    color={isPublished ? Colors.textMuted : '#fff'}
                  />
                  <Text style={[
                    styles.publishBtnText,
                    { color: isPublished ? Colors.textMuted : '#fff' },
                  ]}>
                    {isPublished ? 'إلغاء النشر' : 'نشر للطلاب'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
