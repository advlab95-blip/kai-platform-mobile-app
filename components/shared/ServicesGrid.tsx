import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Colors } from '../../constants/colors';
import { tokens } from '../../constants/designTokens';
import { haptics } from '../../utils/haptics';
import useFeatureFlagsStore from '../../stores/featureFlagsStore';
import useNotificationStore from '../../stores/notificationStore';
import useAuthStore from '../../stores/authStore';
import useDataStore from '../../stores/dataStore';

// Maps a service tile (by route + featureKey) to the notification.type strings
// it should consume. When the user enters the tile, those types get marked as
// read. Returning multiple types is supported — e.g. "Communication" can clear
// both 'message' and 'chat' types in one go.
function notificationTypesFor(route: string, featureKey?: string): string[] {
  const r = (route || '').toLowerCase();
  const fk = (featureKey || '').toLowerCase();
  if (r.includes('announcement') || fk.includes('announcement')) return ['announcement'];
  if (r.includes('exam-schedule') || fk.includes('exam_schedule')) return ['exam_schedule'];
  if (r.includes('exam') || fk.includes('exam')) return ['exam'];
  if (r.includes('assignment') || r.includes('homework') || fk.includes('homework') || fk.includes('assignment')) return ['homework', 'assignment'];
  if (r.includes('grade') || fk.includes('grade')) return ['grade'];
  if (r.includes('attendance') || fk.includes('attendance')) return ['attendance'];
  if (r.includes('promotion') || fk.includes('promotion')) return ['promotion'];
  if (r.includes('schedule') || r.includes('timetable')) return ['schedule', 'timetable'];
  if (r.includes('messages') || r.includes('chat') || fk.includes('chat')) return ['message', 'chat'];
  if (r.includes('certificate')) return ['certificate'];
  if (r.includes('finance') || r.includes('fees') || r.includes('payments')) return ['payment', 'finance'];
  return [];
}

// Mirror of OPT_IN_ONLY_FEATURES from hooks/useFeatureFlag.ts — kept in sync so both
// paths (inline screens + services grid) hide the same optional features when admin
// hasn't explicitly enabled them.
const OPT_IN_ONLY_FEATURES = new Set<string>([
  'live_streaming', 'voice_messages', 'parent_teacher_chat', 'admin_parent_chat',
  'class_chat',
  'ai_student_chatbot', 'ai_auto_grading', 'ai_predictive_analysis', 'ai_study_plan',
  'ai_teacher_assistant', 'ai_pdf_chat', 'ai_chat_docs', 'ai_mindmap', 'ai_quiz_gen',
  'ai_study_guide', 'ai_summaries',
  'cafeteria', 'medical_records', 'device_attendance', 'attendance_qr',
  'multi_branch', 'leave_requests', 'certificates', 'exam_content_protection',
  'admin_view_user_codes',
]);

interface ServicesGridProps {
  interfaceName: string;
  institutionType?: 'institute' | 'school';
  title?: string;
  topSlot?: React.ReactNode;
  /**
   * Optional extra tiles to append after the catalog-driven services.
   * Useful when an interface needs a quick link (e.g. الجدول) that isn't
   * represented in the available_features catalog yet. Deduped by route.
   */
  extraItems?: Item[];
}

type Item = { icon: string; label: string; color: string; route: string; featureKey?: string; featureKeyAny?: string[]; group?: string; groupIcon?: string };

export default function ServicesGrid({ interfaceName, institutionType, title = 'الخدمات', topSlot, extraItems }: ServicesGridProps) {
  const { catalog, myFlags, catalogLoaded } = useFeatureFlagsStore();

  // Parent home already exposes grades / attendance / fees / communication as
  // shortcut tiles + dedicated tabs. Suppress duplicates from the catalog-driven
  // services grid so we don't show the same destination twice in two places.
  const PARENT_HOME_DUPLICATES = new Set<string>([
    'grades', 'parent_grades',           // home shortcut "الدرجات"
    'fees', 'finance', 'parent_finance', // home shortcut "الدفع" (المالية was the duplicate)
    'attendance', 'parent_attendance',   // bottom tab
    'chat', 'messages', 'parent_chat',   // bottom tab "التواصل"
  ]);

  const services = catalog.filter(feature => {
    if (!feature.target_interfaces.includes(interfaceName)) return false;
    if (['home', 'notifications', 'profile', 'services'].includes(feature.feature_key)) return false;
    // Hide entries that the parent already reaches from home shortcuts / tabs —
    // prevents "الدرجات" and "المالية" from showing up twice on parent's services hub.
    if (interfaceName === 'parent' && PARENT_HOME_DUPLICATES.has(feature.feature_key)) return false;
    // Teacher: schedule is now in the bottom nav (swapped with settings) — hide
    // the catalog-driven duplicate so the hub doesn't show it twice.
    if (interfaceName === 'teacher' && feature.feature_key === 'schedule') return false;
    if (feature.institute_only && institutionType === 'school') return false;
    if (feature.school_only && institutionType === 'institute') return false;
    if (feature.is_core) return true;
    const flag = myFlags.find(f => f.feature_key === feature.feature_key);
    const isOptIn = OPT_IN_ONLY_FEATURES.has(feature.feature_key);
    if (!flag) return !isOptIn;
    return flag.is_enabled;
  }).sort((a, b) => a.display_order - b.display_order);

  if (!catalogLoaded || services.length === 0) {
    return <FallbackGrid interfaceName={interfaceName} title={title} topSlot={topSlot} extraItems={extraItems} />;
  }

  const baseItems: Item[] = services.map(sv => ({
    icon: sv.icon_name,
    label: sv.feature_name_ar,
    color: sv.color,
    route: (sv.route_by_interface as any)?.[interfaceName] || '/',
  }));

  // Append extras that aren't already in the catalog (dedup by route)
  const existingRoutes = new Set(baseItems.map(it => it.route));
  const extras = (extraItems || []).filter(it => !existingRoutes.has(it.route));
  const items = [...baseItems, ...extras];

  return <ClassicGrid items={items} title={title} topSlot={topSlot} />;
}

function FallbackGrid({ interfaceName, title, topSlot, extraItems }: { interfaceName: string; title: string; topSlot?: React.ReactNode; extraItems?: Item[] }) {
  const { myFlags } = useFeatureFlagsStore();

  const FALLBACK: Record<string, Item[]> = {
    admin: [
      // ── إدارة المنصة ──
      { icon: 'business', label: 'المؤسسات', color: '#4F46E5', route: '/(admin)/institutions', group: 'إدارة المنصة', groupIcon: 'business' },
      { icon: 'people', label: 'المستخدمون', color: '#0EA5E9', route: '/(admin)/users', group: 'إدارة المنصة', groupIcon: 'business' },
      { icon: 'git-branch', label: 'الفروع', color: '#1D4ED8', route: '/(admin)/branches', group: 'إدارة المنصة', groupIcon: 'business' },
      { icon: 'toggle', label: 'الميزات', color: '#10B981', route: '/(admin)/features', group: 'إدارة المنصة', groupIcon: 'business' },
      // ── المالي ──
      { icon: 'cash', label: 'الأقساط', color: '#10B981', route: '/(admin)/fees', group: 'المالي', groupIcon: 'wallet' },
      { icon: 'wallet', label: 'المالية', color: '#059669', route: '/(admin)/finance', group: 'المالي', groupIcon: 'wallet' },
      // ── الأكاديمي ──
      { icon: 'stats-chart', label: 'التقارير', color: '#DC2626', route: '/(admin)/reports', group: 'الأكاديمي', groupIcon: 'school' },
      // ── التواصل والذكاء ──
      { icon: 'flash', label: 'حدود AI', color: '#8B5CF6', route: '/(admin)/ai-limits', group: 'التواصل والذكاء', groupIcon: 'sparkles' },
      { icon: 'analytics', label: 'تقارير AI', color: '#7C3AED', route: '/(admin)/ai-reports', group: 'التواصل والذكاء', groupIcon: 'sparkles' },
      // ── التقني ──
      { icon: 'finger-print', label: 'أجهزة الحضور', color: '#059669', route: '/(admin)/devices', featureKey: 'device_attendance', group: 'التقني', groupIcon: 'construct' },
      { icon: 'shield-checkmark', label: 'سجل العمليات', color: '#7C3AED', route: '/(admin)/audit', group: 'التقني', groupIcon: 'construct' },
      { icon: 'analytics', label: 'مقارنة المؤسسات', color: '#7C3AED', route: '/(admin)/tenant-comparison', group: 'التقني', groupIcon: 'construct' },
      { icon: 'archive', label: 'الأرشيف', color: '#F59E0B', route: '/(admin)/archive', group: 'التقني', groupIcon: 'construct' },
      // ── العمليات (Platform Ops) ── ← added 2026-05-16
      { icon: 'pulse', label: 'صحة النظام', color: '#0EA5E9', route: '/(admin)/system-health', group: 'العمليات', groupIcon: 'speedometer' },
      { icon: 'trending-up', label: 'نشاط المؤسسات', color: '#10B981', route: '/(admin)/institute-activity', group: 'العمليات', groupIcon: 'speedometer' },
      { icon: 'megaphone', label: 'الإعلانات العامة', color: '#F59E0B', route: '/(admin)/broadcasts', group: 'العمليات', groupIcon: 'speedometer' },
      { icon: 'card', label: 'الاشتراكات', color: '#059669', route: '/(admin)/subscriptions', group: 'العمليات', groupIcon: 'speedometer' },
      // ── الدعم والإشراف ──
      { icon: 'chatbubble-ellipses', label: 'صندوق الدعم', color: '#3B82F6', route: '/(admin)/support-inbox', group: 'الدعم والإشراف', groupIcon: 'help-buoy' },
      { icon: 'flag', label: 'المحتوى المُبلَّغ', color: '#EF4444', route: '/(admin)/moderation', group: 'الدعم والإشراف', groupIcon: 'help-buoy' },
      { icon: 'people-circle', label: 'انتحال الهوية', color: '#7C3AED', route: '/(admin)/impersonation', group: 'الدعم والإشراف', groupIcon: 'help-buoy' },
      // ── الأمان ──
      { icon: 'lock-closed', label: 'محاولات الدخول الفاشلة', color: '#DC2626', route: '/(admin)/failed-logins', group: 'الأمان', groupIcon: 'shield' },
      // ── أدوات منصة ──
      { icon: 'sparkles', label: 'سجل التحديثات', color: '#8B5CF6', route: '/(admin)/changelog-editor', group: 'أدوات منصة', groupIcon: 'construct' },
      { icon: 'options', label: 'تفعيل ميزة لكل المؤسسات', color: '#F97316', route: '/(admin)/bulk-feature-toggle', group: 'أدوات منصة', groupIcon: 'construct' },
    ],
    teacher: [
      // ── التدريس ──
      // Note: 'الجدول' (schedule) was moved to the bottom navigation bar — do
      // not duplicate it here in the Services hub.
      { icon: 'calendar-number', label: 'أسبوعي', color: tokens.color.brand500, route: '/(teacher)/my-week', group: 'التدريس', groupIcon: 'school' },
      { icon: 'document-text', label: 'الواجبات', color: tokens.color.info, route: '/(teacher)/assignments', group: 'التدريس', groupIcon: 'school' },
      { icon: 'flask', label: 'الامتحانات', color: tokens.color.purple, route: '/(teacher)/exams', featureKey: 'exam_system', group: 'التدريس', groupIcon: 'school' },
      { icon: 'document-text', label: 'جدول الامتحانات', color: tokens.color.danger, route: '/(teacher)/exam-schedule', group: 'التدريس', groupIcon: 'school' },
      { icon: 'trending-up', label: 'الدرجات', color: tokens.color.success, route: '/(teacher)/grades', group: 'التدريس', groupIcon: 'school' },
      { icon: 'people', label: 'طلابي', color: tokens.color.orange, route: '/(teacher)/students', group: 'التدريس', groupIcon: 'school' },
      // ── التواصل ──
      // "الدردشة" (parent-teacher chat) was removed per request — only "دردشة الصف"
      // remains as the teacher's chat surface.
      { icon: 'people-circle', label: 'دردشة الصف', color: tokens.color.cyan, route: '/(teacher)/class-chat', featureKey: 'class_chat', group: 'التواصل', groupIcon: 'chatbubbles' },
      { icon: 'videocam', label: 'البث المباشر', color: tokens.color.danger, route: '/(teacher)/live', featureKey: 'live_streaming', group: 'التواصل', groupIcon: 'chatbubbles' },
      // ── AI ──
      // Both tiles unlock when ANY teacher-facing AI feature is enabled, so the admin
      // can toggle individual AI capabilities without orphaning the entry points.
      { icon: 'sparkles', label: 'دروس AI', color: tokens.color.purple, route: '/(teacher)/ai-lessons', featureKeyAny: ['ai_teacher_assistant', 'ai_lessons'], group: 'AI', groupIcon: 'sparkles' },
      { icon: 'bulb', label: 'أدوات AI', color: tokens.color.pink, route: '/(teacher)/ai-tools', featureKeyAny: ['ai_teacher_assistant', 'ai_quiz_gen', 'ai_auto_grading'], group: 'AI', groupIcon: 'sparkles' },
      // ── شؤون الموظفين ──
      // Teacher-facing HR action: submit + track personal leave requests.
      // Reviewed by the institute admin via (institute)/leave-requests.
      { icon: 'calendar-clear', label: 'طلب إجازة', color: tokens.color.warning, route: '/(teacher)/leave-request', group: 'شؤون الموظفين', groupIcon: 'briefcase' },
    ],
    student: [
      // ── الدراسة والمتابعة ──
      { icon: 'document-text', label: 'الواجبات', color: tokens.color.info, route: '/(student)/assignments', featureKey: 'electronic_assignments', group: 'الدراسة والمتابعة', groupIcon: 'school' },
      { icon: 'flask', label: 'الامتحانات', color: tokens.color.purple, route: '/(student)/exams', featureKey: 'exam_system', group: 'الدراسة والمتابعة', groupIcon: 'school' },
      { icon: 'calendar', label: 'جدول الامتحانات', color: tokens.color.danger, route: '/(student)/exam-schedule', group: 'الدراسة والمتابعة', groupIcon: 'school' },
      { icon: 'stats-chart', label: 'الإحصائيات', color: tokens.color.success, route: '/(student)/stats', group: 'الدراسة والمتابعة', groupIcon: 'school' },
      { icon: 'trending-up', label: 'التقارير', color: tokens.color.warning, route: '/(student)/reports', group: 'الدراسة والمتابعة', groupIcon: 'school' },
      { icon: 'ribbon', label: 'الشهادات', color: tokens.color.cyan, route: '/(student)/certificates', featureKey: 'certificates', group: 'الدراسة والمتابعة', groupIcon: 'school' },
      // ── شؤوني ── personal-records group: things tied to the individual
      // student (attendance log, behavior feedback, fees, calendar saves).
      { icon: 'calendar-clear', label: 'سجل الحضور', color: tokens.color.info, route: '/(student)/attendance-history', group: 'شؤوني', groupIcon: 'person-circle' },
      { icon: 'happy-outline', label: 'ملاحظاتي', color: tokens.color.success, route: '/(student)/my-behavior', group: 'شؤوني', groupIcon: 'person-circle' },
      { icon: 'wallet-outline', label: 'رسومي وأقساطي', color: tokens.color.warning, route: '/(student)/my-fees', group: 'شؤوني', groupIcon: 'person-circle' },
      { icon: 'calendar-clear', label: 'استئذان', color: tokens.color.warning, route: '/(student)/leave-request', group: 'شؤوني', groupIcon: 'person-circle' },
      { icon: 'calendar-number', label: 'التقويم الأكاديمي', color: tokens.color.purple, route: '/(student)/calendar', group: 'شؤوني', groupIcon: 'person-circle' },
      { icon: 'bookmark', label: 'محفوظاتي', color: tokens.color.pink, route: '/(student)/bookmarks', group: 'شؤوني', groupIcon: 'person-circle' },
      // ── الذكاء الاصطناعي ──
      // Tiles unlock when ANY relevant student-facing AI feature is enabled.
      { icon: 'sparkles', label: 'دروس AI', color: tokens.color.purple, route: '/(student)/ai', featureKeyAny: ['ai_student_chatbot', 'ai_lessons'], group: 'الذكاء الاصطناعي', groupIcon: 'sparkles' },
      { icon: 'chatbubbles', label: 'مساعد AI', color: tokens.color.pink, route: '/(student)/ai-chat', featureKeyAny: ['ai_student_chatbot', 'ai_pdf_chat', 'ai_chat_docs'], group: 'الذكاء الاصطناعي', groupIcon: 'sparkles' },
      { icon: 'bulb', label: 'أدوات AI', color: tokens.color.orange, route: '/(student)/ai-tools', featureKeyAny: ['ai_student_chatbot', 'ai_study_plan', 'ai_predictive_analysis', 'ai_study_guide', 'ai_summaries', 'ai_mindmap'], group: 'الذكاء الاصطناعي', groupIcon: 'sparkles' },
      // ── التواصل ──
      { icon: 'people-circle', label: 'دردشة الصف', color: tokens.color.cyan, route: '/(student)/class-chat', featureKey: 'class_chat', group: 'التواصل', groupIcon: 'chatbubbles' },
      { icon: 'chatbubbles', label: 'الرسائل', color: tokens.color.pink, route: '/(student)/messages', group: 'التواصل', groupIcon: 'chatbubbles' },
      // ── أدوات (standalone) ──
      { icon: 'calendar', label: 'الجدول', color: tokens.color.teal600, route: '/(student)/schedule' },
    ],
    parent: [
      // ── الأكاديمي ──
      // الدرجات/الحضور/المالية مكررة بالصفحة الرئيسية كاختصارات — نخليها هناك بس
      { icon: 'school', label: 'الأكاديمي', color: '#4F46E5', route: '/(parent)/academic', group: 'الأكاديمي', groupIcon: 'school' },
      { icon: 'calendar', label: 'الجدول', color: '#3B82F6', route: '/(parent)/schedule', group: 'الأكاديمي', groupIcon: 'school' },
      { icon: 'document-text', label: 'جدول الامتحانات', color: '#DC2626', route: '/(parent)/exam-schedule', group: 'الأكاديمي', groupIcon: 'school' },
      // ── التواصل ──
      { icon: 'chatbubbles', label: 'التواصل', color: '#EC4899', route: '/(parent)/chat', featureKey: 'admin_parent_chat', group: 'التواصل', groupIcon: 'chatbubbles' },
      { icon: 'paper-plane', label: 'الطلبات', color: '#0EA5E9', route: '/(parent)/leave-requests', group: 'التواصل', groupIcon: 'chatbubbles' },
      { icon: 'people', label: 'اجتماعات الأهالي', color: '#7C3AED', route: '/(parent)/meetings', group: 'التواصل', groupIcon: 'chatbubbles' },
      { icon: 'document-text-outline', label: 'إذونات الخروج', color: '#F59E0B', route: '/(parent)/permission-slips', group: 'التواصل', groupIcon: 'chatbubbles' },
      // ── طفلي ── child-scoped views
      { icon: 'document-text', label: 'واجبات طفلي', color: '#14B8A6', route: '/(parent)/assignments', group: 'طفلي', groupIcon: 'person-circle' },
      { icon: 'happy-outline', label: 'ملاحظات طفلي', color: '#10B981', route: '/(parent)/behavior', group: 'طفلي', groupIcon: 'person-circle' },
      { icon: 'wallet-outline', label: 'الرسوم والأقساط', color: '#F59E0B', route: '/(parent)/finance', group: 'طفلي', groupIcon: 'person-circle' },
      { icon: 'calendar-number', label: 'التقويم الأكاديمي', color: '#7C3AED', route: '/(parent)/calendar', group: 'طفلي', groupIcon: 'person-circle' },
      // ── الصحة والإعدادات ──
      { icon: 'medkit', label: 'السجلات الطبية', color: '#DC2626', route: '/(parent)/medical', featureKey: 'medical_records', group: 'أخرى', groupIcon: 'ellipsis-horizontal' },
      { icon: 'settings', label: 'الإعدادات', color: '#64748B', route: '/(parent)/settings', group: 'أخرى', groupIcon: 'ellipsis-horizontal' },
    ],
    institute: [
      // ── العمليات اليومية ──
      { icon: 'people', label: 'المستخدمون', color: '#1D4ED8', route: '/(institute)/users', group: 'العمليات اليومية', groupIcon: 'people-circle' },
      { icon: 'megaphone', label: 'الإعلانات', color: '#EA580C', route: '/(institute)/ads', group: 'العمليات اليومية', groupIcon: 'people-circle' },
      { icon: 'chatbubbles', label: 'الرسائل', color: '#EC4899', route: '/(institute)/chat', group: 'العمليات اليومية', groupIcon: 'people-circle' },
      { icon: 'exit-outline', label: 'طلبات الإجازة', color: '#F59E0B', route: '/(institute)/leave-requests', featureKey: 'leave_requests', group: 'العمليات اليومية', groupIcon: 'people-circle' },
      // ── الأكاديمي ──
      { icon: 'document-text', label: 'جدول الامتحانات', color: '#DC2626', route: '/(institute)/exam-schedule', group: 'الأكاديمي', groupIcon: 'school' },
      { icon: 'calendar-outline', label: 'التقويم الدراسي', color: '#7C3AED', route: '/(institute)/academic-calendar', group: 'الأكاديمي', groupIcon: 'school' },
      { icon: 'arrow-up-circle', label: 'الترفيع', color: '#10B981', route: '/(institute)/promotion', group: 'الأكاديمي', groupIcon: 'school' },
      { icon: 'ribbon', label: 'الشهادات', color: '#0891B2', route: '/(institute)/certificates', group: 'الأكاديمي', groupIcon: 'school' },
      // ── المالي ──
      { icon: 'wallet', label: 'المالية', color: '#059669', route: '/(institute)/finance', group: 'المالي', groupIcon: 'wallet' },
      { icon: 'cash', label: 'الرواتب', color: '#10B981', route: '/(institute)/payroll', group: 'المالي', groupIcon: 'wallet' },
      // ── التواصل والإنتاجية ──
      { icon: 'reader', label: 'قوالب الإعلانات', color: '#F59E0B', route: '/(institute)/ann-templates', group: 'التواصل', groupIcon: 'chatbubbles' },
      // ── إدارة المؤسسة ──
      { icon: 'shield-half', label: 'الأدوار والصلاحيات', color: '#7C3AED', route: '/(institute)/roles', group: 'إدارة المؤسسة', groupIcon: 'business' },
      { icon: 'cloud-upload', label: 'استيراد دفعي', color: '#0EA5E9', route: '/(institute)/bulk-import', group: 'إدارة المؤسسة', groupIcon: 'business' },
      { icon: 'archive', label: 'الأرشيف', color: '#F59E0B', route: '/(institute)/archive', group: 'إدارة المؤسسة', groupIcon: 'business' },
      // ── التقارير والمساءلة ──
      { icon: 'stats-chart', label: 'التقارير', color: '#DC2626', route: '/(institute)/reports', group: 'التقارير والمساءلة', groupIcon: 'bar-chart' },
      { icon: 'shield-checkmark', label: 'سجل العمليات', color: '#7C3AED', route: '/(institute)/audit', group: 'التقارير والمساءلة', groupIcon: 'bar-chart' },
      { icon: 'help-buoy', label: 'الدعم الفني', color: '#3B82F6', route: '/(institute)/help-support', group: 'التقارير والمساءلة', groupIcon: 'bar-chart' },
      // ── ميزات إضافية ──
      { icon: 'happy', label: 'الملاحظات السلوكية', color: '#06B6D4', route: '/(institute)/behavior-notes', group: 'ميزات إضافية', groupIcon: 'sparkles' },
      { icon: 'book', label: 'المكتبة', color: '#8B5CF6', route: '/(institute)/library', group: 'ميزات إضافية', groupIcon: 'sparkles' },
      { icon: 'bus', label: 'الحافلات', color: '#F97316', route: '/(institute)/bus-routes', group: 'ميزات إضافية', groupIcon: 'sparkles' },
    ],
    cafeteria: [
      { icon: 'restaurant', label: 'القائمة', color: '#F59E0B', route: '/(cafeteria)/menu' },
      { icon: 'receipt', label: 'الطلبات', color: '#10B981', route: '/(cafeteria)/orders' },
      { icon: 'settings', label: 'الإعدادات', color: '#64748B', route: '/(cafeteria)/settings' },
    ],
    medical: [
      { icon: 'medkit', label: 'السجلات', color: '#EF4444', route: '/(medical)/records' },
      { icon: 'document-text', label: 'التقارير', color: '#DC2626', route: '/(medical)/reports' },
      { icon: 'settings', label: 'الإعدادات', color: '#64748B', route: '/(medical)/settings' },
    ],
  };

  const allItems = FALLBACK[interfaceName] || [];
  const isKeyEnabled = (key: string): boolean => {
    const flag = myFlags.find(f => f.feature_key === key);
    const isOptIn = OPT_IN_ONLY_FEATURES.has(key);
    if (!flag) return !isOptIn;
    return flag.is_enabled;
  };
  const baseItems = allItems.filter(item => {
    // "any of" multi-flag gate: render if ANY listed flag is enabled (e.g. ai-tools tile)
    if (item.featureKeyAny && item.featureKeyAny.length > 0) {
      return item.featureKeyAny.some(isKeyEnabled);
    }
    if (!item.featureKey) return true;
    return isKeyEnabled(item.featureKey);
  });

  // Append any extras not already represented by route
  const existingRoutes = new Set(baseItems.map(it => it.route));
  const items = [
    ...baseItems,
    ...((extraItems || []).filter(it => !existingRoutes.has(it.route))),
  ];

  // If any items carry a `group`, render a grouped layout; otherwise fall through to the classic 2-col grid
  const hasGroups = items.some(it => !!it.group);
  if (hasGroups) {
    return <GroupedGrid items={items} title={title} topSlot={topSlot} />;
  }
  return <ClassicGrid items={items} title={title} topSlot={topSlot} />;
}

// ═══════════════ Grouped Grid (sectioned list) ═══════════════
function GroupedGrid({ items, title, topSlot }: { items: Item[]; title: string; topSlot?: React.ReactNode }) {
  // Preserve declaration order of groups using a Map
  const groups = new Map<string, { groupIcon?: string; items: Item[] }>();
  for (const it of items) {
    const key = it.group || '__ungrouped';
    if (!groups.has(key)) groups.set(key, { groupIcon: it.groupIcon, items: [] });
    groups.get(key)!.items.push(it);
  }

  return (
    <SafeAreaView style={s.container} edges={topSlot ? ['left', 'right', 'bottom'] : undefined}>
      {topSlot}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }}>
        <View style={s.header}>
          {!topSlot && <Text style={s.title}>{title}</Text>}
          <Text style={s.subtitle}>{items.length} خدمة · {groups.size} مجموعة</Text>
        </View>
        {Array.from(groups.entries()).map(([groupName, { groupIcon, items: groupItems }]) => (
          <View key={groupName} style={grp.section}>
            {groupName !== '__ungrouped' && (
              <View style={grp.groupHeader}>
                {!!groupIcon && (
                  <View style={grp.groupIconWrap}>
                    <Ionicons name={groupIcon as any} size={14} color={Colors.primary} />
                  </View>
                )}
                <Text style={grp.groupTitle}>{groupName}</Text>
              </View>
            )}
            <View style={grp.groupItems}>
              {groupItems.map(it => <ClassicCard key={it.route} item={it} />)}
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

// ═══════════════ Classic Grid (2-col solid cards) ═══════════════
function ClassicGrid({ items, title, topSlot }: { items: Item[]; title: string; topSlot?: React.ReactNode }) {
  return (
    <SafeAreaView style={s.container} edges={topSlot ? ['left', 'right', 'bottom'] : undefined}>
      {topSlot}
      <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 30 }}>
        <View style={s.header}>
          {!topSlot && <Text style={s.title}>{title}</Text>}
          <Text style={s.subtitle}>{items.length} خدمة</Text>
        </View>
        <View style={cls.grid}>
          {items.map(it => <ClassicCard key={it.route} item={it} />)}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function ClassicCard({ item }: { item: Item }) {
  const router = useRouter();
  const unreadByType = useNotificationStore((s) => s.unreadByType);
  const markTypeRead = useNotificationStore((s) => s.markTypeRead);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const userInstituteId = useDataStore((s) => s.userInstituteId);

  // Sum unread across all types this tile owns (e.g. "communication" → message + chat).
  const types = notificationTypesFor(item.route, item.featureKey);
  const unread = types.reduce((sum, t) => sum + (unreadByType[t] || 0), 0);

  return (
    <TouchableOpacity
      style={cls.card}
      activeOpacity={0.85}
      onPress={async () => {
        haptics.light();
        // Mark this section's unread notifications as read BEFORE navigating —
        // the user is clearly acknowledging the badge by tapping the tile.
        // markTypeRead is fire-and-forget; we don't block navigation on it.
        if (unread > 0 && userId && role) {
          for (const t of types) {
            markTypeRead(t, userId, role, userInstituteId || undefined);
          }
        }
        router.navigate(item.route as any);
      }}
    >
      <View style={[cls.icon, { backgroundColor: item.color }]}>
        <Ionicons name={item.icon as any} size={22} color="#fff" />
      </View>
      {unread > 0 && (
        <View style={cls.badge}>
          <Text style={cls.badgeText}>{unread > 99 ? '99+' : unread}</Text>
        </View>
      )}
      <Text style={cls.label} numberOfLines={2}>{item.label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: 6, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '900', color: Colors.text, textAlign: 'right' },
  subtitle: { fontSize: 12, color: Colors.textMuted, textAlign: 'right', marginTop: 4 },
});

const grp = StyleSheet.create({
  section: {
    marginTop: 18,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  groupIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: Colors.text,
    textAlign: 'right',
    flex: 1,
  },
  groupItems: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
});

const cls = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingTop: 10,
  },
  card: {
    width: '48.5%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  icon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  label: {
    fontSize: 12, fontWeight: '800', color: Colors.text,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: 8, right: 8,
    minWidth: 22, height: 22,
    borderRadius: 11,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
    borderWidth: 2, borderColor: '#fff',
  },
  badgeText: {
    fontSize: 10, fontWeight: '900', color: '#fff',
  },
});
