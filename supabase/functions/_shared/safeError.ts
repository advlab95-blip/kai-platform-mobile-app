// Shared error-formatting helper for Edge Functions.
//
// Goal: never leak DB error messages, RLS hints, or stack traces to the client.
// The client gets a generic Arabic message; the original error is logged to
// Supabase Function logs (server-side only) for debugging.
//
// Usage:
//   try { ... } catch (e) {
//     return new Response(JSON.stringify(safeError(e, 'create_user')), {
//       status: 500, headers: corsHeaders,
//     });
//   }

interface ErrorContext {
  scope: string;        // e.g. 'admin-ops:create_user'
  callerId?: string;    // who triggered it (for log correlation)
}

const PUBLIC_MESSAGES: Record<string, string> = {
  unauthorized:        'غير مصرح',
  forbidden:           'غير مسموح بهذه العملية',
  rate_limited:        'محاولات كثيرة — حاول بعد قليل',
  not_found:           'لم يتم العثور على العنصر',
  invalid_input:       'بيانات غير صالحة',
  conflict:            'تعارض بالبيانات',
  internal:            'حدث خطأ — حاول مرة أخرى',
};

export function safeError(
  err: unknown,
  ctx: string | ErrorContext,
  publicCode: keyof typeof PUBLIC_MESSAGES = 'internal',
): { error: string; code: string } {
  const scope = typeof ctx === 'string' ? ctx : ctx.scope;
  const callerId = typeof ctx === 'string' ? undefined : ctx.callerId;

  // Server-side log: full error, never returned to client.
  const errMsg = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  console.error(`[${scope}]${callerId ? ` caller=${callerId}` : ''}`, errMsg, errStack);

  return {
    error: PUBLIC_MESSAGES[publicCode] || PUBLIC_MESSAGES.internal,
    code: publicCode,
  };
}

// Categorize a known error into a public code based on its message. Useful
// when the original error needs to be surfaced semantically (e.g. validation
// failures should return 400 with `invalid_input` not 500 with `internal`).
export function classifyError(err: unknown): keyof typeof PUBLIC_MESSAGES {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  if (msg.includes('غير مصرح') || msg.includes('unauthor')) return 'unauthorized';
  if (msg.includes('غير مسموح') || msg.includes('forbidden')) return 'forbidden';
  if (msg.includes('rate') || msg.includes('too many')) return 'rate_limited';
  if (msg.includes('not found') || msg.includes('غير موجود')) return 'not_found';
  if (msg.includes('invalid') || msg.includes('غير صالح') || msg.includes('مطلوب')) return 'invalid_input';
  if (msg.includes('conflict') || msg.includes('duplicate') || msg.includes('already exists')) return 'conflict';
  return 'internal';
}
