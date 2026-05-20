import { useEffect } from 'react';
import { useSegments } from 'expo-router';
import useFeatureFlagsStore from '../stores/featureFlagsStore';
import useAuthStore from '../stores/authStore';
import useDataStore from '../stores/dataStore';
import type { AvailableFeature } from '../stores/featureFlagsStore';

// Features that are HIDDEN by default and require explicit admin opt-in.
// Without an enabled flag record, these stay completely invisible to all roles (except admin).
// Rule of thumb: any optional feature an institute may or may not want.
// Core features NOT in this set (content_management, interactive_schedule,
// electronic_assignments, exam_system, fees_management) stay visible by default.
const OPT_IN_ONLY_FEATURES = new Set<string>([
  // Streaming / comms
  'live_streaming',
  'voice_messages',
  'parent_teacher_chat',
  'admin_parent_chat',
  'class_chat',
  // All AI features — hidden unless admin explicitly turns them on
  'ai_student_chatbot',
  'ai_auto_grading',
  'ai_predictive_analysis',
  'ai_study_plan',
  'ai_teacher_assistant',
  'ai_pdf_chat',
  'ai_chat_docs',
  'ai_mindmap',
  'ai_quiz_gen',
  'ai_study_guide',
  'ai_summaries',
  // Operational extras
  'cafeteria',
  'medical_records',
  'device_attendance',
  'attendance_qr',
  'multi_branch',
  'leave_requests',
  'certificates',
  'exam_content_protection',
  // Admin privacy
  'admin_view_user_codes',
]);

/**
 * Hook to check if a feature is enabled for the current user's institute.
 * Auto-refreshes flags on mount if not loaded yet.
 */
export function useFeatureFlag(featureKey: string): boolean {
  const role = useAuthStore((s) => s.role);
  const instId = useDataStore((s) => s.userInstituteId);
  const myFlags = useFeatureFlagsStore((s) => s.myFlags);
  const loadMyFlags = useFeatureFlagsStore((s) => s.loadMyFlags);
  const segments = useSegments();
  // The route group the screen belongs to: '(admin)', '(teacher)', '(student)', etc.
  // Used so platform admin only bypasses flags inside their own group; when they
  // preview teacher/student screens they evaluate the actual institute flags.
  const currentGroup = (segments?.[0] as string | undefined) || '';
  const isInsideAdminGroup = currentGroup === '(admin)';

  // Refresh flags on mount (catches admin changes). Skip the load when the
  // platform admin is in their own group (they don't have an institute scope).
  useEffect(() => {
    if (instId && !(role === 'admin' && isInsideAdminGroup)) {
      loadMyFlags(instId);
    }
  }, [instId, role, isInsideAdminGroup]);

  // Platform admin: bypass ONLY when inside (admin). Inside any other group
  // (preview / impersonation), evaluate the real flag for that institute so
  // disabled features (live, attendance_qr, ...) stay hidden as configured.
  if (role === 'admin' && isInsideAdminGroup) return true;

  const isOptIn = OPT_IN_ONLY_FEATURES.has(featureKey);

  // Not yet authenticated / institute not detected — keep opt-in features hidden
  // (no flash of optional UI during auth transition); regular features stay visible
  // so basic navigation doesn't break. Previously this returned true for ALL keys
  // which leaked disabled features (e.g. live_streaming) onto teacher home until
  // userInstituteId resolved.
  if (!instId || !role) return !isOptIn;

  // Flags not loaded yet:
  //   opt-in features → keep hidden until we know for sure (no flicker + no leak)
  //   regular features → show by default (will hide after load if disabled)
  if (myFlags.length === 0) return !isOptIn;

  // Find the flag
  const flag = myFlags.find(f => f.feature_key === featureKey);
  if (!flag) return !isOptIn; // No flag: opt-in → hide, regular → show

  if (!flag.is_enabled) return false;

  // Check target_roles for AI features
  if (featureKey.startsWith('ai_') && role) {
    const targetRoles: string[] = (flag as any)?.target_roles || ['teacher', 'student'];
    if (!targetRoles.includes(role)) return false;
  }

  return true;
}

/**
 * Hook to get all available services for the Services Hub page.
 * Returns only features that:
 * 1. Target this interface
 * 2. Are not core navigation items (home, notifications, profile, services)
 * 3. Pass institute/school type filtering
 * 4. Are enabled (for toggleable features) or always shown (for non-toggleable)
 *
 * Usage: const services = useServicesForInterface('student', 'institute');
 */
export function useServicesForInterface(
  interfaceName: string,
  institutionType?: 'institute' | 'school'
): AvailableFeature[] {
  return useFeatureFlagsStore((state) =>
    state.getServicesForInterface(interfaceName, institutionType)
  );
}
