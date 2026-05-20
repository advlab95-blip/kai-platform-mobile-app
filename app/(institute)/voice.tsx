// Legacy standalone voice-broadcast page has been retired.
//
// User decision (2026-05-08): voice messages live INSIDE the chat conversation
// only — the institute admin sends voice from the same composer that handles
// text (1-1 chat header + group composer in `(institute)/chat.tsx`).
//
// This route file is kept as a redirect so any stale deep link / bookmark
// lands the admin on the chat screen instead of a 404. The Tabs.Screen entry
// in `_layout.tsx` still hides it with `href: null` so it never appears in
// the tab bar. No UI entry point in the institute UI references this route.
//
// Do NOT add a new entry to INSTITUTE_SERVICES or QuickActionsGrid that
// targets this route — voice messages are chat-only by product decision.
import { Redirect } from 'expo-router';
export default function LegacyVoiceRedirect() {
  return <Redirect href="/(institute)/chat" />;
}
