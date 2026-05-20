export const APP_CONFIG = {
  name: 'منصة كاي',
  nameEn: 'KAI Platform',
  version: '1.0.0',

  // Roles
  roles: [
    { id: 'admin', label: 'مدير النظام', icon: 'shield-checkmark', color: '#2F2FBA' },
    { id: 'institute', label: 'الإدارة', icon: 'business', color: '#00347D' },
    { id: 'teacher', label: 'الأستاذ', icon: 'school', color: '#1D4ED8' },
    { id: 'student', label: 'الطالب', icon: 'people', color: '#0D9488' },
    { id: 'parent', label: 'ولي الأمر', icon: 'person', color: '#7C3AED' },
    { id: 'cafeteria', label: 'الكافتيريا', icon: 'cafe', color: '#F97316' },
    { id: 'medical', label: 'الطبابة', icon: 'medkit', color: '#EF4444' },
  ] as const,

  // Pagination
  pageSize: {
    students: 20,
    notifications: 10,
    announcements: 10,
    videos: 10,
  },
} as const;

export type RoleId = typeof APP_CONFIG.roles[number]['id'];
