import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { applyTheme } from '../constants/colors';

type ThemeMode = 'light' | 'dark' | 'system';

const lightColors = {
  primary: '#2F2FBA',
  primaryDark: '#020024',
  accent: '#B9EEAE',
  cyan: '#00D4FF',
  navy: '#00347D',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  surfaceSecondary: '#F1F5F9',
  border: '#E2E8F0',
  text: '#1E293B',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  textOnPrimary: '#FFFFFF',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
  cardBg: '#FFFFFF',
  inputBg: '#F8FAFC',
  modalOverlay: 'rgba(0,0,0,0.4)',
};

const darkColors = {
  primary: '#6366F1',
  primaryDark: '#0F172A',
  accent: '#86EFAC',
  cyan: '#22D3EE',
  navy: '#1E3A8A',
  background: '#0F172A',
  surface: '#1E293B',
  surfaceSecondary: '#334155',
  border: '#334155',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  info: '#60A5FA',
  cardBg: '#1E293B',
  inputBg: '#0F172A',
  modalOverlay: 'rgba(0,0,0,0.7)',
};

export type ThemeColors = typeof lightColors;

type ThemeContextType = {
  mode: ThemeMode;
  isDark: boolean;
  colors: ThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const STORAGE_KEY = '@theme_mode';
const ThemeContext = createContext<ThemeContextType | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Dark mode removed — provider locks to light. setMode is a no-op to avoid breaking callers.
  const value: ThemeContextType = {
    mode: 'light',
    isDark: false,
    colors: lightColors,
    setMode: () => {},
  };
  useEffect(() => { applyTheme(false); }, []);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}

/**
 * Hook that returns theme-aware colors.
 * Drop-in replacement for the static `Colors` import.
 * Usage: const Colors = useColors();
 */
export function useColors() {
  // Always light — dark mode removed
  return lightColors;
}

/** Get current colors outside React (for StyleSheet.create at module level) */
export function getColors(): ThemeColors {
  return lightColors; // Static — use useColors() inside components for reactive
}
