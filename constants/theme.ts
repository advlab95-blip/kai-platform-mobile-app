// Design tokens mirroring the HTML spec in kay-app-complete (1).html.
// Additive to constants/colors.ts — does NOT replace Colors (backward compat).
// Scope: /(institute)/ screens only. Other roles keep using Colors + Gradients.

export const tokens = {
  brand: {
    900: '#020024',
    700: '#1E1E6B',
    500: '#2F2FBA',
    100: '#EEF2FF',
    50:  '#F5F7FF',
  },
  semantic: {
    success:   '#059669', successBg: '#ECFDF5',
    warning:   '#D97706', warningBg: '#FEF3C7',
    danger:    '#DC2626', dangerBg:  '#FEE2E2',
    info:      '#0284C7', infoBg:    '#E0F2FE',
    purple:    '#7C3AED', purpleBg:  '#F3E8FF',
    pink:      '#DB2777', pinkBg:    '#FCE7F3',
    orange:    '#EA580C', orangeBg:  '#FFEDD5',
    teal:      '#0D9488', tealBg:    '#CCFBF1',
  },
  surface: {
    bg:       '#F5F7FB',
    surface:  '#FFFFFF',
    surface2: '#F8FAFC',
  },
  text: {
    1: '#0F172A',
    2: '#334155',
    3: '#64748B',
    4: '#94A3B8',
  },
  border: {
    1: '#E2E8F0',
    2: '#F1F5F9',
  },
  radius: { sm: 12, md: 14, lg: 18, xl: 22, xxl: 28 },
  shadow: {
    xs: {
      elevation: 1,
      shadowColor: '#0F172A',
      shadowOpacity: 0.04,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
    },
    md: {
      elevation: 4,
      shadowColor: '#0F172A',
      shadowOpacity: 0.06,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
    },
    lg: {
      elevation: 8,
      shadowColor: '#0F172A',
      shadowOpacity: 0.08,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: 20 },
    },
    broadcast: {
      elevation: 10,
      shadowColor: '#2F2FBA',
      shadowOpacity: 0.25,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 14 },
    },
    qrActive: {
      elevation: 8,
      shadowColor: '#059669',
      shadowOpacity: 0.3,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
    },
  },
  heroGradient:      ['#00347D', '#1E3A8A', '#312E81'] as const,
  broadcastGradient: ['#020024', '#2F2FBA'] as const,
  qrActiveGradient:  ['#059669', '#10B981'] as const,
} as const;

export type Tokens = typeof tokens;
