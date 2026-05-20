import { create } from 'zustand';
import { api } from '../services/api';
import { supabase } from '../services/supabase';
import useAuthStore from './authStore';

// ── Types ──────────────────────────────────

export interface AvailableFeature {
  id: string;
  feature_key: string;
  feature_name_ar: string;
  feature_name_en: string | null;
  description_ar: string | null;
  category: string;
  icon_name: string;
  color: string;
  target_interfaces: string[];
  route_by_interface: Record<string, string>;
  is_core: boolean;
  institute_only: boolean;
  school_only: boolean;
  display_order: number;
}

export interface FeatureFlag {
  id: string;
  institute_id: string;
  feature_key: string;
  feature_id: string | null;
  is_enabled: boolean;
  enabled_at: string | null;
  enabled_by: string | null;
  settings: Record<string, any>;
  available_feature?: AvailableFeature;
}

// Hardcoded feature definitions (fallback if DB not yet migrated)
export const FEATURE_DEFINITIONS: Record<string, {
  name: string;
  description: string;
  icon: string;
  color: string;
  instituteOnly?: boolean;
  schoolOnly?: boolean;
  teacherOnly?: boolean;
  studentOnly?: boolean;
}> = {
  attendance_qr: {
    name: 'حضور QR Code',
    description: 'تسجيل حضور الطلاب عبر مسح QR Code بمدخل المؤسسة',
    icon: 'qr-code',
    color: '#059669',
  },
  interactive_schedule: {
    name: 'الجدول التفاعلي',
    description: 'جدول دراسي تفاعلي مع إشعارات وتحديثات فورية',
    icon: 'calendar',
    color: '#1D4ED8',
  },
  electronic_assignments: {
    name: 'الواجبات الإلكترونية',
    description: 'نظام واجبات مع حل وتسليم وتصحيح داخل التطبيق',
    icon: 'document-text',
    color: '#7C3AED',
  },
  exam_system: {
    name: 'نظام الامتحانات',
    description: 'امتحانات إلكترونية بـ 8 أنواع أسئلة مع تصحيح',
    icon: 'school',
    color: '#B45309',
  },
  exam_content_protection: {
    name: 'حماية الامتحانات',
    description: 'منع التصوير والنسخ ومشاركة محتوى الامتحانات',
    icon: 'shield-checkmark',
    color: '#DC2626',
  },
  certificates: {
    name: 'الشهادات',
    description: 'إصدار شهادات رقمية PDF مع QR للتحقق',
    icon: 'ribbon',
    color: '#0891B2',
  },
  parent_teacher_chat: {
    name: 'دردشة ولي الأمر',
    description: 'دردشة مباشرة بين الأستاذ وولي الأمر',
    icon: 'chatbubbles',
    color: '#16A34A',
  },
  ai_student_chatbot: {
    name: 'AI مساعد الطالب',
    description: 'مساعد ذكي يجاوب أسئلة الطالب الدراسية',
    icon: 'sparkles',
    color: '#8B5CF6',
  },
  ai_auto_grading: {
    name: 'AI تصحيح تلقائي',
    description: 'تصحيح الامتحانات تلقائياً بالذكاء الاصطناعي',
    icon: 'checkmark-done-circle',
    color: '#6366F1',
    teacherOnly: true,
  },
  ai_predictive_analysis: {
    name: 'AI تحليل تنبؤي',
    description: 'تحليل أداء الطالب وتوقع مستواه المستقبلي',
    icon: 'analytics',
    color: '#0D9488',
  },
  ai_study_plan: {
    name: 'AI خطة دراسية',
    description: 'خطط دراسية شخصية مولّدة بالذكاء الاصطناعي',
    icon: 'map',
    color: '#EA580C',
  },
  ai_teacher_assistant: {
    name: 'AI مساعد الأستاذ',
    description: 'أدوات ذكية للأستاذ: توليد أسئلة، خطط دروس، تقارير',
    icon: 'bulb',
    color: '#CA8A04',
    teacherOnly: true,
  },
  live_streaming: {
    name: 'البث المباشر',
    description: 'بث مباشر من الأستاذ للطلاب عبر الكاميرا أو RTMP',
    icon: 'videocam',
    color: '#EF4444',
  },
  multi_branch: {
    name: 'الفروع المتعددة',
    description: 'إدارة فروع متعددة لنفس المؤسسة',
    icon: 'git-branch',
    color: '#0D9488',
  },
  leave_requests: {
    name: 'طلبات الإجازات',
    description: 'نظام طلب وإدارة إجازات الأساتذة والطلاب',
    icon: 'calendar-outline',
    color: '#F97316',
  },
  fees_management: {
    name: 'إدارة الرسوم',
    description: 'نظام رسوم الاشتراك والمتابعة المالية',
    icon: 'wallet',
    color: '#10B981',
  },
  content_management: {
    name: 'إدارة المحتوى',
    description: 'رفع ومشاركة فيديوهات وملفات PDF وصور وصوتيات',
    icon: 'book',
    color: '#3B82F6',
  },
  voice_messages: {
    name: 'الرسائل الصوتية',
    description: 'إرسال واستقبال رسائل صوتية بين الأستاذ والطلاب',
    icon: 'mic',
    color: '#F59E0B',
  },
  admin_parent_chat: {
    name: 'دردشة الإدارة مع أولياء الأمور',
    description: 'محادثات مباشرة بين إدارة المؤسسة وأولياء الأمور',
    icon: 'chatbubbles',
    color: '#EC4899',
  },
  ai_pdf_chat: {
    name: 'AI اسأل عن الملف',
    description: 'الطالب يسأل AI أسئلة عن محتوى ملف PDF المادة',
    icon: 'chatbubble-ellipses',
    color: '#7C3AED',
  },
  cafeteria: {
    name: 'الكافتيريا',
    description: 'نظام طلبات وإدارة كافتيريا المؤسسة',
    icon: 'restaurant',
    color: '#F59E0B',
  },
  medical_records: {
    name: 'السجلات الطبية',
    description: 'نظام سجلات طبية للطلاب مع تنبيهات لأولياء الأمور',
    icon: 'medkit',
    color: '#EF4444',
  },
  device_attendance: {
    name: 'حضور بالأجهزة',
    description: 'ربط أجهزة بصمة وأجهزة حضور إلكترونية لتسجيل حضور الطلاب تلقائياً',
    icon: 'finger-print',
    color: '#059669',
  },
  ai_chat_docs: {
    name: 'AI محادثة مع الملفات',
    description: 'محادثة ذكية مع ملفات PDF والمستندات التعليمية',
    icon: 'document-text',
    color: '#6366F1',
  },
  ai_mindmap: {
    name: 'AI خريطة ذهنية',
    description: 'توليد خرائط ذهنية تلقائية من الدروس والمواد',
    icon: 'git-network',
    color: '#0891B2',
  },
  ai_quiz_gen: {
    name: 'AI توليد أسئلة',
    description: 'توليد أسئلة امتحانات ومراجعة تلقائياً بالذكاء الاصطناعي',
    icon: 'help-circle',
    color: '#D946EF',
    teacherOnly: true,
  },
  ai_study_guide: {
    name: 'AI دليل دراسي',
    description: 'إنشاء أدلة دراسية مخصصة لكل طالب حسب مستواه',
    icon: 'compass',
    color: '#14B8A6',
    studentOnly: true,
  },
  ai_summaries: {
    name: 'AI تلخيصات',
    description: 'تلخيص تلقائي للدروس والمحاضرات بالذكاء الاصطناعي',
    icon: 'reader',
    color: '#F97316',
  },
};

// ── Store ──────────────────────────────────

interface FeatureFlagsState {
  // Available features catalog (from DB)
  catalog: AvailableFeature[];
  catalogLoaded: boolean;

  // Flags for current user's institute
  myFlags: FeatureFlag[];
  // All flags (admin view)
  allFlags: FeatureFlag[];
  isLoading: boolean;

  // Load catalog from DB
  loadCatalog: () => Promise<void>;

  // Get services for a specific interface (for Services Hub)
  getServicesForInterface: (interfaceName: string, institutionType?: 'institute' | 'school') => AvailableFeature[];

  loadMyFlags: (instituteId: string) => Promise<void>;
  loadAllFlags: () => Promise<void>;
  isEnabled: (featureKey: string) => boolean;

  // Re-run loadMyFlags for the current user's institute. Useful on screen-focus
  // so an admin's flag toggle propagates without an app restart.
  refresh: () => Promise<void>;

  // Wipe back to initial state — called on logout so a freshly logged-in user
  // from a different tenant doesn't inherit the previous user's flags.
  reset: () => void;

  // Realtime: subscribe to feature_flags changes for this institute so admin
  // toggles propagate to every connected user instantly (no navigation required).
  subscribeToFlags: (instituteId: string) => () => void;
}

const useFeatureFlagsStore = create<FeatureFlagsState>((set, get) => ({
  catalog: [],
  catalogLoaded: false,
  myFlags: [],
  allFlags: [],
  isLoading: false,

  loadCatalog: async () => {
    try {
      const data = await api.getAvailableFeatures();
      set({ catalog: data, catalogLoaded: true });
    } catch (err) {
      console.error('[Feature catalog load]:', err);
    }
  },

  getServicesForInterface: (interfaceName, institutionType) => {
    const { catalog, myFlags } = get();
    // Kept in sync with hooks/useFeatureFlag.ts — any optional feature that must
    // not leak until the admin explicitly switches it on for a specific institute.
    const OPT_IN_ONLY = new Set<string>([
      'live_streaming', 'voice_messages', 'parent_teacher_chat', 'admin_parent_chat', 'class_chat',
      'ai_student_chatbot', 'ai_auto_grading', 'ai_predictive_analysis', 'ai_study_plan',
      'ai_teacher_assistant', 'ai_pdf_chat', 'ai_chat_docs', 'ai_mindmap', 'ai_quiz_gen',
      'ai_study_guide', 'ai_summaries',
      'cafeteria', 'medical_records', 'device_attendance', 'attendance_qr',
      'multi_branch', 'leave_requests', 'certificates', 'exam_content_protection',
    ]);
    return catalog.filter(feature => {
      // Must target this interface
      if (!feature.target_interfaces.includes(interfaceName)) return false;
      // Skip core nav items (home, notifications, profile, services)
      if (['home', 'notifications', 'profile', 'services'].includes(feature.feature_key)) return false;
      // Institute-only check
      if (feature.institute_only && institutionType === 'school') return false;
      // School-only check
      if (feature.school_only && institutionType === 'institute') return false;
      // Core features for this interface are always shown
      if (feature.is_core) return true;
      // Optional features: check if enabled in myFlags
      const flag = myFlags.find(f => f.feature_key === feature.feature_key);
      const isOptIn = OPT_IN_ONLY.has(feature.feature_key);
      if (!flag) return !isOptIn;
      return flag.is_enabled;
    });
  },

  loadMyFlags: async (instituteId) => {
    try {
      const flags = await api.getFeatureFlags(instituteId);
      set({ myFlags: flags });
    } catch (err) { console.error('[Feature flags load]:', err); }
  },

  loadAllFlags: async () => {
    // Mirror the gate in api.getAllFeatureFlags — refuses cross-tenant fetch
    // for non-platform-admins so an institute admin who accidentally lands on
    // the platform features screen never even issues the query.
    const role = useAuthStore.getState().role;
    if (role !== 'admin') {
      if (__DEV__) console.warn('[featureFlagsStore] loadAllFlags blocked — role:', role);
      return;
    }
    set({ isLoading: true });
    try {
      const flags = await api.getAllFeatureFlags();
      set({ allFlags: flags });
    } catch (err) { console.error('[All flags load]:', err); } finally {
      set({ isLoading: false });
    }
  },

  isEnabled: (featureKey) => {
    const flags = get().myFlags;
    if (flags.length === 0) return true; // No flags loaded yet = show (will re-check after load)
    const flag = flags.find(f => f.feature_key === featureKey);
    if (!flag) return true; // Flag not found = not controlled = show
    return flag.is_enabled;
  },

  refresh: async () => {
    // Lazy import to avoid a circular dependency between dataStore and this store.
    try {
      const { default: useDataStore } = await import('./dataStore');
      const instituteId = useDataStore.getState().userInstituteId;
      if (!instituteId) return;
      await get().loadMyFlags(instituteId);
    } catch (err) { console.error('[Feature flags refresh]:', err); }
  },

  reset: () => {
    set({ catalog: [], catalogLoaded: false, myFlags: [], allFlags: [], isLoading: false });
  },

  subscribeToFlags: (instituteId) => {
    if (!instituteId) return () => { /* no-op */ };

    const refresh = () => {
      // Full reload — cheap (single row per feature) and covers INSERT/UPDATE/DELETE uniformly.
      get().loadMyFlags(instituteId);
    };

    // Unique channel name per call — supabase.channel(name) caches by name and
    // adding `.on()` to an already-subscribed channel throws
    // "tried to add callbacks after subscribe()" on remount (HMR, double-effect).
    const chan = supabase
      .channel(`feature-flags-${instituteId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'feature_flags',
        filter: `institute_id=eq.${instituteId}`,
      }, refresh)
      .subscribe();

    return () => {
      supabase.removeChannel(chan);
    };
  },
}));

export default useFeatureFlagsStore;
