// Fallback used when the teacher has no recorded subjects/grades — kept generic
// so the composer is never empty, but the runtime path always prefers the
// dynamic builder below (buildSampleSuggestions).
export const SAMPLE_PROMPTS = [
  'درس عن الكسور الاعتيادية للصف الخامس',
  'مقدمة عن الخلية الحيوانية وأجزائها',
  'قواعد كتابة الهمزة في وسط الكلمة',
  'معركة القادسية وأهم نتائجها',
];

// Per-subject seed phrases. Each one is a topic the AI can expand into a full
// lesson and is broad enough to combine with any grade. Keep entries short
// (3–6 words) so they fit in a chip.
const SUBJECT_TOPICS: Record<string, string[]> = {
  // Arabic + Islamic
  'العربية': ['الإعراب والمبني', 'كتابة الهمزة', 'البلاغة والاستعارة', 'النص الأدبي وتحليله'],
  'اللغة العربية': ['الإعراب والمبني', 'كتابة الهمزة', 'البلاغة والاستعارة', 'النص الأدبي وتحليله'],
  'القرآن': ['أحكام التجويد', 'تفسير سورة الفاتحة', 'الإدغام والإخفاء'],
  'الإسلامية': ['أركان الإسلام', 'سيرة الرسول ﷺ', 'الأخلاق في الإسلام'],
  'التربية الإسلامية': ['أركان الإسلام', 'سيرة الرسول ﷺ', 'الأخلاق في الإسلام'],
  // English
  'الإنجليزية': ['Present Simple Tense', 'Reading comprehension', 'Vocabulary building'],
  'اللغة الإنجليزية': ['Present Simple Tense', 'Reading comprehension', 'Vocabulary building'],
  'English': ['Present Simple Tense', 'Reading comprehension', 'Vocabulary building'],
  // Math
  'الرياضيات': ['الكسور الاعتيادية', 'المعادلات الخطية', 'الهندسة والمضلعات', 'النسبة والتناسب'],
  'رياضيات': ['الكسور الاعتيادية', 'المعادلات الخطية', 'الهندسة والمضلعات', 'النسبة والتناسب'],
  // Sciences
  'العلوم': ['الخلية الحيوانية', 'دورة الماء في الطبيعة', 'الكواكب والمجموعة الشمسية'],
  'الأحياء': ['الخلية وأجزاؤها', 'الجهاز الدوري', 'التكاثر في النباتات', 'الجينات والوراثة'],
  'الفيزياء': ['قوانين نيوتن', 'الموجات والصوت', 'الكهرباء والمغناطيسية', 'الديناميكا الحرارية'],
  'الكيمياء': ['الجدول الدوري', 'الروابط الكيميائية', 'الأحماض والقواعد', 'التفاعلات الكيميائية'],
  // Humanities
  'التاريخ': ['الحضارة السومرية', 'معركة القادسية', 'الدولة العباسية', 'الحرب العالمية الثانية'],
  'الجغرافية': ['المناخ والتضاريس', 'السكان والهجرة', 'موارد العراق الطبيعية'],
  'الجغرافيا': ['المناخ والتضاريس', 'السكان والهجرة', 'موارد العراق الطبيعية'],
  'الاجتماعيات': ['النظام السياسي', 'حقوق الإنسان', 'الاقتصاد الأساسي'],
  'التربية الوطنية': ['الدستور العراقي', 'حقوق وواجبات المواطن', 'النظام البرلماني'],
  // Tech
  'الحاسوب': ['أساسيات الخوارزميات', 'مكونات الحاسوب', 'مقدمة في البرمجة'],
  'الحاسبات': ['أساسيات الخوارزميات', 'مكونات الحاسوب', 'مقدمة في البرمجة'],
};

function topicsForSubject(subject: string): string[] {
  if (!subject) return [];
  // Direct hit, then loose contains-match (handles "مادة الرياضيات" or "العلوم العامة")
  if (SUBJECT_TOPICS[subject]) return SUBJECT_TOPICS[subject];
  const lower = subject.toLowerCase();
  for (const key of Object.keys(SUBJECT_TOPICS)) {
    if (subject.includes(key) || key.includes(subject) || key.toLowerCase() === lower) {
      return SUBJECT_TOPICS[key];
    }
  }
  return [];
}

/**
 * Build chip-sized lesson prompt suggestions tailored to the teacher's actual
 * assignments. Combines each subject with a stage/grade hint so the AI lesson
 * generator stays inside the teacher's scope (and the suggestions feel
 * relevant, not random).
 */
export function buildSampleSuggestions(
  subjects: string[] | undefined | null,
  grades: string[] | undefined | null,
  max = 6,
): string[] {
  const subs = (subjects || []).filter(Boolean);
  if (subs.length === 0) return SAMPLE_PROMPTS;

  // Prefer the most specific grade first, then a stage-only hint, then "بشكل عام".
  const gradeList = (grades || []).filter(Boolean);
  const gradeHint = (i: number): string => {
    if (gradeList.length === 0) return '';
    const g = gradeList[i % gradeList.length];
    return g ? ` لـ${g}` : '';
  };

  const out: string[] = [];
  // Round-robin through subjects so every subject the teacher has gets a chip.
  const perSubject = Math.max(1, Math.ceil(max / subs.length));
  for (let s = 0; s < subs.length && out.length < max; s++) {
    const subject = subs[s];
    const topics = topicsForSubject(subject);
    if (topics.length === 0) {
      // Generic shape when subject isn't in our seed map — still bounded by subject + grade.
      out.push(`درس مقدمة في ${subject}${gradeHint(s)}`);
      continue;
    }
    for (let i = 0; i < perSubject && out.length < max; i++) {
      const topic = topics[i % topics.length];
      out.push(`${topic}${gradeHint(s + i)}`);
    }
  }
  return out.slice(0, max);
}

/**
 * Safe string render. AI sometimes returns objects where we expect strings (e.g. a
 * `summary: {label, description}` blob), which crashes React with "Objects are not
 * valid as a React child". This coerces any value to a readable string so one bad
 * field doesn't blow up the whole lesson card.
 */
export function str(v: any): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(str).filter(Boolean).join(' — ');
  if (typeof v === 'object') {
    // Prefer common natural-language keys
    if (typeof v.text === 'string') return v.text;
    if (typeof v.description === 'string') return v.description;
    if (typeof v.label === 'string') return v.label;
    if (typeof v.value === 'string') return v.value;
    // Fallback: concatenate string values
    const parts = Object.values(v).filter((x) => typeof x === 'string');
    if (parts.length) return parts.join(' — ');
    return '';
  }
  return '';
}

/**
 * The prompt that turns raw content into a rich, NotebookLM-style lesson package.
 * We ask for a single JSON blob with all sections — one round-trip keeps latency reasonable.
 */
// Bump this version when the schema changes so the server-side cache (keyed by prompt hash)
// doesn't return stale responses with the old shape (e.g. svg instead of imagePrompt).
export const PROMPT_VERSION = 'v5-focus-key-content-2026-05-08';

export const buildRichPrompt = (content: string) => `[${PROMPT_VERSION}]
أنت خبير تعليمي متخصص في تصميم دروس تفاعلية احترافية مع infographics. مهمتك تحويل المحتوى التالي إلى درس شامل عالي الجودة.

**مهم — استخراج المحتوى المفيد فقط:**
- ركّز على المفاهيم الأساسية والمصطلحات الجوهرية فقط
- تجاهل المقدمات الفارغة، الإهداءات، شكر الناشر، الفهارس، الحواشي
- تجاهل الأمثلة الإطنابية وحدد بأهم 3-5 أمثلة فعّالة
- استخرج "ما يحتاج الطالب أن يحفظه ويفهمه"، لا كل ما هو مكتوب
- لو المحتوى طويل، حدّد أعمق 6-8 أفكار وأبنِ الدرس حولها

أنشئ درساً يحتوي على الأقسام التالية بصيغة JSON دقيقة:

1. title — عنوان الدرس (قصير، جذاب، 3-6 كلمات)
2. objectives — 4-6 أهداف تعليمية (ماذا سيتعلم الطالب بعد الدرس)
3. summary — ملخص مكثّف ومفيد (120-200 كلمة) — يركز على المفاهيم الجوهرية فقط، بدون حشو
4. concepts — 5-8 مفاهيم رئيسية، كل واحد {term, definition} — مصطلحات يجب على الطالب حفظها
5. mindMap — خريطة ذهنية: شجرة {label, children: [{label, children: []}]}, 3-5 فروع رئيسية
6. infographics — 3-5 صور واقعية حقيقية للدرس. كل واحدة: {title, caption, imagePrompt}
7. quiz — 5 أسئلة اختيار من متعدد: {question, options: [4 خيارات], correctIndex: 0-3, explanation}
8. flashcards — 8-12 بطاقة سؤال/جواب نمط Anki: {front, back} — تركّز على المفاهيم الأساسية القابلة للحفظ السريع
9. faq — 4-6 أسئلة شائعة: {question, answer}
10. examples — 3-5 أمثلة واقعية مختصرة وفعّالة
11. keyStats — 2-4 أرقام أو حقائق: {label, value}
12. furtherReading — 2-4 اقتراحات للتعمق

**قواعد infographics (مهمة جداً):**
- title و caption بالعربية
- imagePrompt **بالإنجليزية فقط**، **قصير جداً (5-10 كلمات كحد أقصى)** — مصطلحات علمية مفتاحية دقيقة
- استخدم كلمات محددة من المادة: اسم الجسم/الظاهرة + نوع العرض + مجال
- **لا جمل كاملة، لا "high quality", لا "photograph of"** — فقط المصطلحات العلمية
- كل صورة لها imagePrompt **مختلف ومحدد** يصف شي مرئي واضح

**أمثلة imagePrompt صحيحة (قصيرة + دقيقة):**
- "virus structure electron microscope"
- "plant cell chloroplast organelles"
- "human heart anatomy cross section"
- "bacteria shapes cocci bacilli spirilla"
- "photosynthesis chloroplast diagram"
- "DNA double helix molecular structure"
- "mitochondria cell organelle"
- "Newton second law force acceleration"
- "periodic table chemistry elements"

**أمثلة خاطئة (لا تستخدمها):**
- ❌ "High quality educational photograph of a plant cell..." (طويلة جداً)
- ❌ "رسم توضيحي للخلية" (عربي، الخدمة لا تدعمها)
- ❌ "Beautiful detailed realistic picture showing..." (أوصاف جمالية بلا معنى علمي)

**قواعد عامة:**
- كل النصوص (title, caption, summary, etc.) بالعربية الفصحى
- **imagePrompt وحده بالإنجليزية** — **قصير (5-10 كلمات) ودقيق علمياً**
- كل صورة **فريدة** — لا تكرر نفس المصطلحات
- محتوى دقيق علمياً
- رد بـ JSON صالح فقط، بدون نص خارجي

المحتوى الخام:
"""
${content}
"""

أجب بـ JSON صالح فقط:`;
