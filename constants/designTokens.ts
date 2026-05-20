// Universal design tokens — single source of truth for all role screens.
// Additive to constants/colors.ts (Proxy, untouched) and constants/theme.ts (institute).
// Roles: teacher (brand blue) · student (teal) · medical (red) · cafeteria (orange) · parent (violet).

export const tokens = {
  color: {
    // Teacher / brand blue
    brand900: '#020024',
    brand800: '#0D0A4B',
    brand700: '#1E1E6B',
    brand600: '#2525A0',
    brand500: '#2F2FBA',
    brand100: '#EEF2FF',
    brand50:  '#F5F7FF',

    success:     '#059669', successBg: '#D1FAE5',
    warning:     '#D97706', warningBg: '#FEF3C7',
    danger:      '#DC2626', dangerBg:  '#FEE2E2',
    info:        '#0284C7', infoBg:    '#DBEAFE',
    purple:      '#7C3AED', purpleBg:  '#EDE9FE',
    pink:        '#DB2777', pinkBg:    '#FCE7F3',
    orange:      '#EA580C', orangeBg:  '#FFEDD5',
    teal:        '#0D9488', tealBg:    '#CCFBF1',
    cyan:        '#0891B2', cyanBg:    '#CFFAFE',
    indigo:      '#4338CA', indigoBg:  '#E0E7FF',

    // Student role accent (teal family)
    teal900: '#064E3B',
    teal800: '#065F46',
    teal700: '#0F766E',
    teal600: '#0D9488',
    teal500: '#14B8A6',
    teal400: '#2DD4BF',
    teal100: '#CCFBF1',
    teal50:  '#F0FDFA',

    // Medical role accent (clinical red family)
    m900: '#7F1D1D',
    m800: '#991B1B',
    m700: '#B91C1C',
    m600: '#DC2626',
    m500: '#EF4444',
    m400: '#F87171',
    m300: '#FCA5A5',
    m100: '#FEE2E2',
    m50:  '#FEF2F2',

    // Medical · blood-type color map (preserved from records.tsx + reports.tsx)
    btOpos:  '#EF4444', btOneg:  '#F97316',
    btApos:  '#3B82F6', btAneg:  '#6366F1',
    btBpos:  '#10B981', btBneg:  '#14B8A6',
    btABpos: '#8B5CF6', btABneg: '#EC4899',

    // Medical · health field accent colors
    fieldHeart:    '#EF4444', fieldHeartBg:    '#FEE2E2',
    fieldThermo:   '#F59E0B', fieldThermoBg:   '#FEF3C7',
    fieldEye:      '#3B82F6', fieldEyeBg:      '#DBEAFE',
    fieldDental:   '#10B981', fieldDentalBg:   '#D1FAE5',
    fieldAllergy:  '#EF4444', fieldAllergyBg:  '#FEE2E2',
    fieldChronic:  '#8B5CF6', fieldChronicBg:  '#EDE9FE',

    // Cafeteria role accent (orange family)
    o900: '#7C2D12',
    o800: '#9A3412',
    o700: '#C2410C',
    o600: '#EA580C',
    o500: '#F97316',
    o400: '#FB923C',
    o300: '#FDBA74',
    o200: '#FED7AA',
    o100: '#FFEDD5',
    o50:  '#FFF7ED',

    // Cafeteria · order-status colors
    statusNewBg:        '#DBEAFE', statusNewFg:        '#1E40AF',
    statusPreparingBg:  '#FEF3C7', statusPreparingFg:  '#92400E',
    statusReadyBg:      '#D1FAE5', statusReadyFg:      '#065F46',
    statusDeliveredBg:  '#E0E7FF', statusDeliveredFg:  '#3730A3',
    statusArchivedBg:   '#F1F5F9', statusArchivedFg:   '#94A3B8',

    // Parent role accent (violet family)
    p900: '#3B0764',
    p800: '#4C1D95',
    p700: '#5B21B6',
    p600: '#7C3AED',
    p500: '#8B5CF6',
    p400: '#A78BFA',
    p100: '#EDE9FE',
    p50:  '#F5F3FF',

    // Parent · medical link accent (used in parent → child medical card)
    medical: '#DC2626',

    bg:       '#F5F7FB',
    surface:  '#FFFFFF',
    surface2: '#F1F5F9',
    surface3: '#E2E8F0',

    text:  '#0F172A',
    text2: '#475569',
    text3: '#94A3B8',
    text4: '#CBD5E1',

    border:  '#E2E8F0',
    border2: '#F1F5F9',
  },

  gradient: {
    brand:   ['#020024', '#1E1E6B', '#2F2FBA'] as const,
    danger:  ['#DC2626', '#EF4444'] as const,
    success: ['#059669', '#10B981'] as const,
    warning: ['#D97706', '#F59E0B'] as const,
    info:    ['#1E3A8A', '#3B82F6'] as const,
    purple:  ['#7C3AED', '#A78BFA'] as const,
    pink:    ['#DB2777', '#EC4899'] as const,
    orange:  ['#EA580C', '#F97316'] as const,
    ai:      ['#7C3AED', '#EC4899'] as const,
    student: ['#0F766E', '#0D9488', '#14B8A6'] as const,
    teal:    ['#0D9488', '#14B8A6'] as const,
    cyan:    ['#0E7490', '#06B6D4'] as const,

    // Medical role
    medical:    ['#991B1B', '#EF4444', '#FCA5A5'] as const,
    medicalBtn: ['#991B1B', '#DC2626'] as const,
    medicalCta: ['#B91C1C', '#EF4444'] as const,

    // Cafeteria role
    cafeteria:    ['#C2410C', '#F97316', '#FDBA74'] as const,
    orderStat:    ['#C2410C', '#EA580C'] as const,
    itemsStat:    ['#065F46', '#10B981'] as const,
    settingsTile: ['#4338CA', '#6366F1'] as const,

    // Parent role
    parent:     ['#5B21B6', '#7C3AED', '#A78BFA'] as const,
    parentSoft: ['#7C3AED', '#A855F7'] as const,
    gradeGood:  ['#065F46', '#10B981'] as const,
    gradeMid:   ['#92400E', '#F59E0B'] as const,
    gradeLow:   ['#991B1B', '#EF4444'] as const,
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 22,
    '2xl': 26,
    pill: 999,
  },

  spacing: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    8: 32,
  },

  shadow: {
    xs:        { shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 2,  shadowOffset: { width: 0, height: 1 },  elevation: 1 },
    sm:        { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 6,  shadowOffset: { width: 0, height: 2 },  elevation: 2 },
    md:        { shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },  elevation: 4 },
    lg:        { shadowColor: '#0F172A', shadowOpacity: 0.12, shadowRadius: 32, shadowOffset: { width: 0, height: 12 }, elevation: 8 },
    brand:     { shadowColor: '#2F2FBA', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    danger:    { shadowColor: '#DC2626', shadowOpacity: 0.30, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    teal:      { shadowColor: '#0D9488', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    purple:    { shadowColor: '#7C3AED', shadowOpacity: 0.25, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    medical:   { shadowColor: '#DC2626', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    cafeteria: { shadowColor: '#F97316', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    parent:    { shadowColor: '#7C3AED', shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
    success:   { shadowColor: '#10B981', shadowOpacity: 0.22, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  },

  font: {
    weight: {
      regular: '400' as const,
      medium:  '500' as const,
      semi:    '600' as const,
      bold:    '700' as const,
      heavy:   '800' as const,
      black:   '900' as const,
    },
    size: {
      xs: 10, sm: 11, base: 12, md: 13, lg: 14, xl: 16, '2xl': 19, '3xl': 22, '4xl': 28, '5xl': 32,
    },
  },
} as const;

export type Tokens = typeof tokens;
