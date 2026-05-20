import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Animated, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import StudentAITabBar from '../../components/shared/StudentAITabBar';
import RoleInnerHero from '../../components/shared/RoleInnerHero';
import { tokens } from '../../constants/designTokens';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';
import { api } from '../../services/api';
import { useFeatureFlag } from '../../hooks/useFeatureFlag';
import { useTranslation } from 'react-i18next';
import { AICache } from '../../services/aiCache';
import { haptics } from '../../utils/haptics';
import { useSpringPress } from '../../hooks/useSpringPress';

// Tool definitions - titles/descs are resolved via t() in the component.
// `tint` / `tintBg` are design-token picks so each tool has a consistent
// iconography treatment without us inventing off-token colors.
const AI_TOOLS_KEYS: {
  key: string;
  titleKey: string;
  descKey: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  tint: string;
  tintBg: string;
  flag: string;
}[] = [
  { key: 'summary',     titleKey: 'student.smartSummary',     descKey: 'student.smartSummaryDesc',     icon: 'document-text', tint: tokens.color.success, tintBg: tokens.color.successBg, flag: 'ai_study_plan' },
  { key: 'study_guide', titleKey: 'student.studyGuide',       descKey: 'student.studyGuideDesc',       icon: 'map',           tint: tokens.color.info,    tintBg: tokens.color.infoBg,    flag: 'ai_study_plan' },
  { key: 'mindmap',     titleKey: 'student.mindMap',          descKey: 'student.mindMapDesc',          icon: 'git-network',   tint: tokens.color.purple,  tintBg: tokens.color.purpleBg,  flag: 'ai_predictive_analysis' },
  { key: 'quiz',        titleKey: 'student.reviewQuestions',  descKey: 'student.reviewQuestionsDesc',  icon: 'help-circle',   tint: tokens.color.warning, tintBg: tokens.color.warningBg, flag: 'ai_student_chatbot' },
  { key: 'explain',     titleKey: 'student.explainToMe',      descKey: 'student.explainToMeDesc',      icon: 'bulb',          tint: tokens.color.pink,    tintBg: tokens.color.pinkBg,    flag: 'ai_student_chatbot' },
];

export default function StudentAITools() {
  const { t } = useTranslation();
  const { userId } = useAuthStore();
  const { userInstituteId } = useDataStore();
  // Feature flag gating: filter tools to those enabled for this institute.
  // A tool is visible only if its flag resolves to a non-false value.
  const aiStudyPlan = useFeatureFlag('ai_study_plan');
  const aiPredictive = useFeatureFlag('ai_predictive_analysis');
  const aiChatbot = useFeatureFlag('ai_student_chatbot');
  const flagMap: Record<string, boolean> = {
    ai_study_plan: aiStudyPlan,
    ai_predictive_analysis: aiPredictive,
    ai_student_chatbot: aiChatbot,
  };
  const AI_TOOLS = AI_TOOLS_KEYS
    .filter(tool => flagMap[tool.flag] !== false)
    .map(tool => ({ ...tool, title: t(tool.titleKey), desc: t(tool.descKey) }));

  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [generating, setGenerating] = useState(false);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const [studentSubjects, setStudentSubjects] = useState<string[]>([]);

  React.useEffect(() => {
    if (!userId) return;
    api.getStudentSubjectNames(userId).then(setStudentSubjects).catch(() => setStudentSubjects([]));
  }, [userId]);

  const handleGenerate = async (toolKey: string) => {
    if (__DEV__) console.log('[AI-Tools] generate:', toolKey, 'input:', input.trim().substring(0, 20), 'userId:', userId, 'instId:', userInstituteId);
    if (generating) return;
    if (rateLimitedUntil > Date.now()) {
      const secondsLeft = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
      Alert.alert(t('student.usageLimitTitle'), `يرجى الانتظار ${secondsLeft} ثانية قبل المحاولة مرة أخرى`);
      return;
    }
    if (!input.trim()) { Alert.alert('تنبيه', 'اكتب الموضوع أولاً'); return; }
    if (!userId || !userInstituteId) { Alert.alert('خطأ', 'يرجى تسجيل الدخول مرة أخرى'); return; }

    // Rate limit (server-side + 60s client lockout on throttle)
    let allowed = true;
    try { allowed = await api.checkAIRateLimit(userId, 'student_tools', 20); } catch {}
    if (!allowed) {
      setRateLimitedUntil(Date.now() + 60_000);
      Alert.alert(t('student.usageLimitTitle'), t('student.usageLimitReached'));
      return;
    }

    haptics.medium();
    setGenerating(true);
    setResult('');

    // The exact 5 Arabic prompts — DO NOT rewrite. Per-tool format instructions
    // are load-bearing (e.g. mindmap prompt expects a specific tree structure).
    const prompts: Record<string, string> = {
      summary: `أنت مساعد تعليمي. لخّص هذا الموضوع بالعربية بـ 5-7 نقاط رئيسية مع شرح مختصر لكل نقطة:\n\n${input.trim()}`,
      study_guide: `أنت مساعد تعليمي خبير. ولّد دليل مذاكرة مفصّل بالعربية لهذا الموضوع. يتضمن:\n1. الأهداف (ما يجب أن تعرفه)\n2. المفاهيم الأساسية\n3. خطوات الدراسة\n4. أسئلة للمراجعة الذاتية\n5. نصائح للامتحان\n\nالموضوع: ${input.trim()}`,
      mindmap: `أنت مساعد تعليمي. حوّل هذا الموضوع لخريطة ذهنية نصية بالعربية. استخدم هذا التنسيق:\n\n📌 [الموضوع الرئيسي]\n├── 🔵 [فرع 1]\n│   ├── • نقطة\n│   └── • نقطة\n├── 🟢 [فرع 2]\n│   ├── • نقطة\n│   └── • نقطة\n└── 🟡 [فرع 3]\n    ├── • نقطة\n    └── • نقطة\n\nالموضوع: ${input.trim()}`,
      quiz: `أنت مساعد تعليمي. ولّد 8 أسئلة مراجعة بالعربية عن هذا الموضوع:\n- 4 أسئلة اختيار من متعدد (مع 4 خيارات والإجابة الصحيحة)\n- 2 أسئلة صح/خطأ (مع الإجابة)\n- 2 أسئلة مقالية قصيرة\n\nالموضوع: ${input.trim()}`,
      explain: `أنت معلم صبور. اشرح هذا المفهوم بالعربية بأبسط طريقة ممكنة. استخدم أمثلة من الحياة اليومية. اشرح كأنك تشرح لطالب بالمتوسطة:\n\nالمفهوم: ${input.trim()}`,
    };

    const prompt = prompts[toolKey];
    if (!prompt) { setGenerating(false); return; }

    try {
      await api.logAIUsage(userId, userInstituteId, 'student_tools');

      // Check cache first — key is namespaced by userId to prevent cross-student
      // leaks on shared devices (same prompt by different student = different entry).
      const cacheKey = `${userId}::${prompt}`;
      const cached = await AICache.get(cacheKey);
      if (cached) {
        setResult(cached);
        setGenerating(false);
        return;
      }

      const { callAIProxy } = await import('../../services/api');
      // Restrict AI to the student's enrolled subjects — off-topic requests get polite refusal.
      // Pass the sub-tool key as the feature so admin-set per-feature daily limits apply per-tool.
      const answer = await callAIProxy(prompt, userId, toolKey, undefined, studentSubjects);

      // Cache the response under the user-scoped key.
      await AICache.set(cacheKey, answer);
      setResult(answer);
    } catch (err: any) {
      const msg = (err?.message || '').toString();
      const status = err?.status;
      const isRateLimit = status === 429 || /rate/i.test(msg) || msg.includes('حد');
      if (isRateLimit) {
        setRateLimitedUntil(Date.now() + 60_000);
        Alert.alert(t('student.usageLimitTitle'), 'تم تجاوز حد الطلبات — يرجى الانتظار 60 ثانية');
      }
      setResult(t('student.errorTryAgain'));
    } finally {
      setGenerating(false);
    }
  };

  // ─────────── Result view ───────────
  if (activeTool && result) {
    const tool = AI_TOOLS.find(t => t.key === activeTool);
    const tint = tool?.tint || tokens.color.purple;
    return (
      <SafeAreaView style={s.container}>
        <View style={s.subHeader}>
          <TouchableOpacity
            onPress={() => { haptics.light(); setActiveTool(null); setResult(''); setInput(''); }}
            style={s.subBack}
            accessibilityLabel={t('student.backLabel')}
          >
            <Ionicons name="arrow-forward" size={20} color={tokens.color.text} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.subTitle}>{tool?.title}</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 30 }}>
          <View style={s.resultCard}>
            <Text style={s.resultText}>{result}</Text>
          </View>
        </ScrollView>
        <View style={{ padding: 16 }}>
          <ColoredButton
            label={t('student.newRequest')}
            icon="refresh"
            tint={tint}
            onPress={() => { haptics.selection(); setResult(''); }}
          />
        </View>
      </SafeAreaView>
    );
  }

  // ─────────── Input view ───────────
  if (activeTool) {
    const tool = AI_TOOLS.find(t => t.key === activeTool);
    const tint = tool?.tint || tokens.color.purple;
    const locked = generating || !input.trim() || rateLimitedUntil > Date.now();
    return (
      <SafeAreaView style={s.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.subHeader}>
            <TouchableOpacity
              onPress={() => { haptics.light(); setActiveTool(null); setInput(''); }}
              style={s.subBack}
              accessibilityLabel={t('student.backLabel')}
            >
              <Ionicons name="arrow-forward" size={20} color={tokens.color.text} />
            </TouchableOpacity>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={s.subTitle}>{tool?.title}</Text>
            </View>
            <View style={{ width: 36 }} />
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, flexGrow: 1 }}>
            <Text style={s.inputHint}>
              {tool?.desc} {t('student.writeTopicOrSubject')}
            </Text>
            <TextInput
              style={s.input}
              placeholder={t('student.topicPlaceholder')}
              placeholderTextColor={tokens.color.text3}
              value={input}
              onChangeText={setInput}
              textAlign="right"
              multiline
              autoFocus
            />
          </ScrollView>
          <View style={{ padding: 16 }}>
            <ColoredButton
              label={t('student.generateWithAI')}
              icon="sparkles"
              tint={tint}
              loading={generating}
              disabled={locked}
              onPress={() => handleGenerate(activeTool)}
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ─────────── Tools list ───────────
  return (
    <SafeAreaView style={s.container} edges={['left', 'right', 'bottom']}>
      <RoleInnerHero
        title="الذكاء الاصطناعي"
        gradient={tokens.gradient.student}
        glowAccent="rgba(20,184,166,0.30)"
      />
      <StudentAITabBar active="tools" />
      <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Purple-pink AI intro card */}
        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          <LinearGradient
            colors={tokens.gradient.ai as unknown as readonly [string, string, ...string[]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.introCard}
          >
            <View style={s.introSparkles}>
              <Ionicons name="sparkles" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.introTitle}>مساعدك في الدراسة</Text>
              <Text style={s.introSub}>{AI_TOOLS_KEYS.length} أدوات ذكية بين يديك</Text>
            </View>
          </LinearGradient>
        </View>

        <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
          {AI_TOOLS.length === 0 ? (
            <View style={s.emptyBox}>
              <View style={[s.emptyChip, { backgroundColor: tokens.color.purpleBg }]}>
                <Ionicons name="lock-closed-outline" size={30} color={tokens.color.purple} />
              </View>
              <Text style={s.emptyTitle}>الميزات الذكية غير مفعّلة</Text>
              <Text style={s.emptyDesc}>راجع إدارة المؤسسة لتفعيل الميزات الذكية لحسابك.</Text>
            </View>
          ) : AI_TOOLS.map(tool => (
            <TouchableOpacity
              key={tool.key}
              style={s.toolCard}
              onPress={() => { haptics.selection(); setActiveTool(tool.key); }}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={20} color={tokens.color.text3} />
              <View style={{ flex: 1, alignItems: 'flex-end', gap: 2, marginHorizontal: 12 }}>
                <Text style={s.toolTitle}>{tool.title}</Text>
                <Text style={s.toolDesc} numberOfLines={2}>{tool.desc}</Text>
              </View>
              <View style={[s.toolIcon, { backgroundColor: tool.tintBg }]}>
                <Ionicons name={tool.icon} size={22} color={tool.tint} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Local colored CTA button — matches PrimaryButton's press-spring feel but
// lets us tint with the active tool's exact hex (PrimaryButton only accepts
// gradient keys from the tokens map).
function ColoredButton({
  label,
  icon,
  tint,
  onPress,
  loading,
  disabled,
}: {
  label: string;
  icon?: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
  tint: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const { scale, onPressIn, onPressOut } = useSpringPress();
  const isLocked = !!(disabled || loading);
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: isLocked ? 0.55 : 1 }}>
      <Pressable
        accessibilityRole="button"
        onPress={isLocked ? undefined : onPress}
        onPressIn={isLocked ? undefined : onPressIn}
        onPressOut={isLocked ? undefined : onPressOut}
        disabled={isLocked}
        style={[s.coloredBtn, { backgroundColor: tint }]}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon ? <Ionicons name={icon} size={18} color="#fff" /> : null}
            <Text style={s.coloredBtnText}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },

  // Intro card
  introCard: {
    borderRadius: tokens.radius['2xl'],
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...tokens.shadow.purple,
  },
  introSparkles: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'right',
  },
  introSub: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    textAlign: 'right',
  },

  // Tool cards
  toolCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    ...tokens.shadow.sm,
  },
  toolIcon: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'right',
  },
  toolDesc: {
    fontSize: 12,
    color: tokens.color.text3,
    textAlign: 'right',
    lineHeight: 18,
  },

  // Sub-header (input / result views)
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    backgroundColor: tokens.color.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  subBack: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: tokens.color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: tokens.color.text,
  },

  // Input view
  inputHint: {
    fontSize: 13,
    color: tokens.color.text2,
    textAlign: 'right',
    marginBottom: 14,
    lineHeight: 22,
  },
  input: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 16,
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
    minHeight: 140,
    textAlignVertical: 'top',
    lineHeight: 24,
  },

  // Result view
  resultCard: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    padding: 16,
    ...tokens.shadow.sm,
  },
  resultText: {
    fontSize: 15,
    fontWeight: '600',
    color: tokens.color.text,
    lineHeight: 28,
    textAlign: 'right',
  },

  // Colored CTA
  coloredBtn: {
    height: 48,
    borderRadius: tokens.radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coloredBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },

  // Empty
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
  },
  emptyChip: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: tokens.color.text,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 12,
    color: tokens.color.text3,
    textAlign: 'center',
    lineHeight: 20,
  },
});
