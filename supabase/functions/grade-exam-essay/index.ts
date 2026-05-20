// Supabase Edge Function: grade-exam-essay
// Tier 3 / F4 — AI grading suggestions for essay & short-answer exam questions.
//
// Endpoint: POST https://<project>.supabase.co/functions/v1/grade-exam-essay
//
// Body:
//   {
//     "question":     string,   // the question text the student answered
//     "modelAnswer":  string,   // teacher's reference answer / rubric
//     "studentAnswer":string,   // what the student wrote
//     "maxPoints":    number    // upper bound for the suggested score (>0)
//   }
//
// Response (200):
//   { "score": number, "feedback": string }
//
// Behaviour & guarantees
// ──────────────────────
// 1. Calls the existing `ai-proxy` Edge Function — NOT the upstream provider
//    directly. That keeps rate-limiting, per-institute caching, role limits,
//    and cost tracking centralized in one place. If the AI provider changes,
//    only ai-proxy needs a redeploy.
//
// 2. The AI is *suggestive only*. The caller (teacher screen) is expected to
//    review and accept / edit / reject before persisting to `exam_answers`.
//    This function never writes to the database — it returns the suggestion
//    and the teacher's UI is responsible for the actual update.
//
// 3. The output is parsed defensively: the model may wrap JSON in markdown
//    fences, prefix it with prose, or hallucinate extra fields. We extract
//    the first `{...}` block, parse it, and clamp `score` into [0, maxPoints]
//    so we never hand the UI an out-of-range suggestion.
//
// 4. Auth is delegated to ai-proxy: we forward the caller's Bearer token
//    unchanged. ai-proxy resolves the user from the JWT and applies the
//    teacher's role-based daily limit. No JWT → 401 from ai-proxy → 401 here.
//
// 5. NOT deployed yet. The user (per task instructions) deploys manually
//    after review. Created only as source under supabase/functions/.

import { buildCorsHeaders } from '../_shared/cors.ts';
import { safeError, classifyError } from '../_shared/safeError.ts';

// Hard caps on incoming text — prevents prompt-stuffing abuse where an
// attacker pads the modelAnswer with megabytes of text to inflate cost.
// These are well above legitimate exam-question lengths.
const MAX_QUESTION_LEN = 4000;
const MAX_MODEL_ANSWER_LEN = 6000;
const MAX_STUDENT_ANSWER_LEN = 8000;

// Absolute ceiling on max_points to prevent a malicious caller from
// passing `maxPoints: 1e308` and getting an obscene suggested score.
// Exams in the app cap individual question points at 100.
const MAX_POINTS_CEILING = 100;

interface GradePayload {
  question: string;
  modelAnswer: string;
  studentAnswer: string;
  maxPoints: number;
}

interface AISuggestion {
  score: number;
  feedback: string;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Build the Arabic grading prompt. We constrain the model to return JSON
// only — no preamble, no markdown — because parsing prose responses is a
// reliability hazard. The schema is repeated in both the instructions and
// the example to maximise compliance.
function buildPrompt(p: GradePayload): string {
  return [
    'أنت معلم خبير. قارن إجابة الطالب مع الإجابة النموذجية وأعطِ درجة عادلة.',
    '',
    `الدرجة القصوى: ${p.maxPoints}`,
    '',
    'السؤال:',
    p.question,
    '',
    'الإجابة النموذجية:',
    p.modelAnswer || '(لا توجد إجابة نموذجية — قيّم بناءً على جودة الإجابة العامة)',
    '',
    'إجابة الطالب:',
    p.studentAnswer || '(لم يجب)',
    '',
    'تعليمات صارمة:',
    `- الدرجة عدد بين 0 و ${p.maxPoints} (يسمح بالكسور مثل 2.5).`,
    '- التعليق باللغة العربية الفصحى، جملتان كحد أقصى، يشرح سبب الدرجة.',
    '- إذا كانت الإجابة فارغة أو غير ذات صلة بالسؤال، الدرجة 0.',
    '- إذا كانت الإجابة جزئية، أعطِ درجة جزئية متناسبة.',
    '- أعد JSON فقط، بدون أي نص قبله أو بعده، بدون علامات markdown.',
    '',
    'مثال على الصيغة المطلوبة:',
    `{"score": ${Math.round(p.maxPoints / 2)}, "feedback": "الإجابة تغطي النقاط الرئيسية لكن تنقص أمثلة."}`,
  ].join('\n');
}

// Extract a JSON object from a possibly-noisy LLM response. The model
// sometimes wraps output in ```json fences or adds an intro line — we
// strip those before parsing. Returns null on any failure (caller falls
// back to a safe default suggestion).
function extractJson(raw: string): unknown {
  if (!raw) return null;
  // First, try direct parse (fast path — when the model obeyed).
  try {
    return JSON.parse(raw.trim());
  } catch {
    // Fall through to substring extraction.
  }
  // Strip markdown code fences if present.
  let cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // Find the first `{` and the last `}` — defensive against any leading
  // explanation text the model insisted on adding.
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

function parseSuggestion(raw: string, maxPoints: number): AISuggestion {
  const obj = extractJson(raw) as { score?: unknown; feedback?: unknown } | null;
  if (!obj || typeof obj !== 'object') {
    // Model returned garbage — fail safely with a neutral suggestion so
    // the teacher knows the AI couldn't help and grades manually.
    return {
      score: 0,
      feedback: 'تعذّر على الذكاء الاصطناعي تحليل الإجابة — يرجى التصحيح يدوياً.',
    };
  }

  // Coerce score. Accept "5", "5.5", 5, 5.5 — reject anything else as 0.
  const rawScore = obj.score;
  let score = typeof rawScore === 'number'
    ? rawScore
    : typeof rawScore === 'string' ? parseFloat(rawScore) : NaN;
  score = clamp(score, 0, maxPoints);
  // Round to 1 decimal place so the UI doesn't have to format e.g. 4.333333.
  score = Math.round(score * 10) / 10;

  let feedback = typeof obj.feedback === 'string'
    ? obj.feedback.trim()
    : '';
  // Cap feedback to avoid the model dumping a paragraph that wrecks the
  // sheet layout on small phones.
  if (feedback.length > 600) feedback = feedback.slice(0, 600) + '…';
  if (!feedback) feedback = 'لم يقدم الذكاء الاصطناعي تعليقاً.';

  return { score, feedback };
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  try {
    // Auth pass-through. We don't validate the JWT here — ai-proxy will.
    // We just refuse missing tokens early to save a round-trip.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(JSON.stringify({ error: 'غير مخوّل — سجّل الدخول من جديد', code: 'unauthorized' }), {
        status: 401, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    let body: Partial<GradePayload>;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'بيانات الطلب غير صالحة', code: 'invalid_input' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const question = typeof body.question === 'string' ? body.question.trim() : '';
    const modelAnswer = typeof body.modelAnswer === 'string' ? body.modelAnswer.trim() : '';
    const studentAnswer = typeof body.studentAnswer === 'string' ? body.studentAnswer.trim() : '';
    const maxPoints = typeof body.maxPoints === 'number' ? body.maxPoints : NaN;

    if (!question) {
      return new Response(JSON.stringify({ error: 'نص السؤال مطلوب', code: 'invalid_input' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (!Number.isFinite(maxPoints) || maxPoints <= 0) {
      return new Response(JSON.stringify({ error: 'الدرجة القصوى يجب أن تكون رقماً موجباً', code: 'invalid_input' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (maxPoints > MAX_POINTS_CEILING) {
      return new Response(JSON.stringify({ error: `الدرجة القصوى لا يمكن أن تتجاوز ${MAX_POINTS_CEILING}`, code: 'invalid_input' }), {
        status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    if (
      question.length > MAX_QUESTION_LEN ||
      modelAnswer.length > MAX_MODEL_ANSWER_LEN ||
      studentAnswer.length > MAX_STUDENT_ANSWER_LEN
    ) {
      return new Response(JSON.stringify({ error: 'النص أطول من الحد المسموح', code: 'invalid_input' }), {
        status: 413, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Short-circuit for empty student answers — no need to spend tokens.
    if (!studentAnswer) {
      return new Response(JSON.stringify({
        score: 0,
        feedback: 'لم يقدّم الطالب أي إجابة.',
      }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const prompt = buildPrompt({ question, modelAnswer, studentAnswer, maxPoints });

    // Delegate to ai-proxy. Reusing it gives us: JWT validation, per-user
    // rate limiting (60/min global + role daily caps), tenant-scoped
    // caching, and cost tracking in ai_requests_log — all "for free".
    //
    // SUPABASE_URL is auto-injected into every Edge Function runtime.
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!supabaseUrl) {
      return new Response(JSON.stringify({ error: 'إعدادات الخادم غير مكتملة', code: 'internal' }), {
        status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const aiProxyRes = await fetch(`${supabaseUrl}/functions/v1/ai-proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Forward the caller's auth verbatim so ai-proxy resolves THIS
        // teacher (not the service role) and applies their daily cap.
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        prompt,
        // Use the 'summary' bucket — closest analogue to "structured
        // evaluation of provided text". Maps to admin-configurable
        // teacher daily limits (default 15/day per ai-proxy fallback).
        feature: 'summary',
      }),
    });

    if (!aiProxyRes.ok) {
      // Forward the proxy's status + message so 429s reach the UI cleanly
      // (teacher sees the actual daily-limit error instead of a generic 502).
      const passthrough = await aiProxyRes.text();
      return new Response(passthrough || JSON.stringify({ error: 'فشل الاتصال بمزوّد AI', code: 'internal' }), {
        status: aiProxyRes.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await aiProxyRes.json() as { response?: string };
    const raw = typeof aiData.response === 'string' ? aiData.response : '';
    const suggestion = parseSuggestion(raw, maxPoints);

    return new Response(JSON.stringify(suggestion), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const code = classifyError(err);
    return new Response(
      JSON.stringify(safeError(err, 'grade-exam-essay:handler', code)),
      { status: code === 'invalid_input' ? 400 : 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
