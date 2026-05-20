// Light theme colors (default)
const lightColors = {
  primary: '#2F2FBA',
  primaryDark: '#020024',
  accent: '#B9EEAE',
  cyan: '#00D4FF',
  navy: '#00347D',

  // Gradient stops
  gradientFrom: '#020024',
  gradientVia: '#2F2FBA',
  gradientTo: '#00D4FF',

  // UI
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceDark: '#1E293B',
  border: '#E2E8F0',
  borderDark: '#334155',

  // Text
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',

  // Status
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  // Roles
  admin: '#2F2FBA',
  institute: '#00347D',
  teacher: '#1D4ED8',
  student: '#0D9488',
  parent: '#7C3AED',
  cafeteria: '#F97316',
  medical: '#EF4444',
};

// Dark theme colors
const darkColors: typeof lightColors = {
  primary: '#6366F1',
  primaryDark: '#0F172A',
  accent: '#86EFAC',
  cyan: '#22D3EE',
  navy: '#1E3A8A',

  gradientFrom: '#0F172A',
  gradientVia: '#6366F1',
  gradientTo: '#22D3EE',

  background: '#0F172A',
  surface: '#1E293B',
  surfaceDark: '#0F172A',
  border: '#334155',
  borderDark: '#475569',

  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',

  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',

  admin: '#6366F1',
  institute: '#1E3A8A',
  teacher: '#3B82F6',
  student: '#14B8A6',
  parent: '#8B5CF6',
  cafeteria: '#FB923C',
  medical: '#F87171',
};

// Light mode is the ONLY mode — dark mode removed per product decision.
// `applyTheme` is kept as a no-op so existing callers don't break.
export const Colors = new Proxy({} as Record<string, string>, {
  get(_, prop: string) {
    return (lightColors as any)[prop] ?? '';
  },
});

/** No-op — dark theme is removed */
export function applyTheme(_isDark: boolean) {
  // intentionally left blank
}

export const Gradients = {
  primary: ['#020024', '#2F2FBA', '#00D4FF'] as const,
  admin: ['#020024', '#2F2FBA'] as const,
  teacher: ['#00347D', '#1D4ED8'] as const,
  student: ['#0D9488', '#14B8A6'] as const,
  accent: ['#B9EEAE', '#86EFAC'] as const,
} as const;
