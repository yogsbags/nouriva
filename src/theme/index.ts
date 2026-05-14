import React, { createContext, useContext, useState, useCallback } from 'react';
import { useColorScheme, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const lightColors = {
  bg: '#F7F9FC',
  bgSecondary: '#EEF2F9',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceSubtle: '#F7F9FC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',
  borderSubtle: '#F1F5F9',
  primary: '#6366F1',
  primaryLight: '#EEF2FF',
  primaryDark: '#4F46E5',
  primaryMuted: 'rgba(99,102,241,0.12)',
  primaryGlow: 'rgba(99,102,241,0.25)',
  vitality: '#10B981',
  vitalityLight: '#ECFDF5',
  vitalityMuted: 'rgba(16,185,129,0.12)',
  dietaryFeatureBg: '#FFFFFF',
  /** Dietary / longevity card — gold frame (distinct from primary indigo) */
  dietaryFeatureBorder: '#C6A035',
  energy: '#F59E0B',
  energyLight: '#FFFBEB',
  energyMuted: 'rgba(245,158,11,0.12)',
  danger: '#EF4444',
  dangerLight: '#FEF2F2',
  dangerMuted: 'rgba(239,68,68,0.12)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textInverse: '#FFFFFF',
  textOnPrimary: '#FFFFFF',
  navBar: '#FFFFFF',
  navBorder: '#E2E8F0',
  tabBarBg: '#FFFFFF',
  tabBarBorder: '#E2E8F0',
  tabActive: '#6366F1',
  tabInactive: '#94A3B8',
  scoreHigh: '#10B981',
  scoreMid: '#F59E0B',
  scoreLow: '#EF4444',
  scannerBg: '#F7F9FC', // matches bg
  scannerSurface: '#FFFFFF', // matches surface
  scannerCard: '#FFFFFF',
  scannerBorder: '#E2E8F0', // matches border
  scannerText: '#0F172A', // matches textPrimary
  scannerTextMuted: '#94A3B8', // matches textTertiary
  overlay: 'rgba(0,0,0,0.55)',
  divider: '#F1F5F9',
  white: '#FFFFFF',
  black: '#000000',
  shadowColor: '#000000',
};

export const darkColors: typeof lightColors = {
  bg: '#070D1B',
  bgSecondary: '#0C1528',
  surface: '#101A2E',
  surfaceElevated: '#152035',
  surfaceSubtle: '#0C1528',
  border: '#1C2B42',
  borderStrong: '#243550',
  borderSubtle: '#111E33',
  primary: '#818CF8',
  primaryLight: '#1E1B4B',
  primaryDark: '#6366F1',
  primaryMuted: 'rgba(129,140,248,0.18)',
  primaryGlow: 'rgba(129,140,248,0.30)',
  vitality: '#34D399',
  vitalityLight: '#032918',
  vitalityMuted: 'rgba(52,211,153,0.18)',
  dietaryFeatureBg: '#101A2E',
  dietaryFeatureBorder: '#E6C229',
  energy: '#FCD34D',
  energyLight: '#1C1402',
  energyMuted: 'rgba(252,211,77,0.15)',
  danger: '#F87171',
  dangerLight: '#1C0505',
  dangerMuted: 'rgba(248,113,113,0.18)',
  textPrimary: '#EEF2FF',
  textSecondary: '#8EA3BF',
  textTertiary: '#3D5470',
  textInverse: '#0F172A',
  textOnPrimary: '#FFFFFF',
  navBar: '#101A2E',
  navBorder: '#1C2B42',
  tabBarBg: '#101A2E',
  tabBarBorder: '#1C2B42',
  tabActive: '#818CF8',
  tabInactive: '#3D5470',
  scoreHigh: '#34D399',
  scoreMid: '#FCD34D',
  scoreLow: '#F87171',
  scannerBg: '#000000',
  scannerSurface: '#111827',
  scannerCard: '#1F2937',
  scannerBorder: 'rgba(255,255,255,0.07)',
  scannerText: '#FFFFFF',
  scannerTextMuted: '#9CA3AF',
  overlay: 'rgba(0,0,0,0.75)',
  divider: '#1C2B42',
  white: '#FFFFFF',
  black: '#000000',
  shadowColor: '#000000',
};



export type AppColors = typeof lightColors;

type ThemeOverride = 'light' | 'dark' | null;

interface ThemeContextValue {
  colors: AppColors;
  isDark: boolean;
  themeOverride: ThemeOverride;
  setThemeOverride: (t: ThemeOverride) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  isDark: false,
  themeOverride: null,
  setThemeOverride: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>(null);

  React.useEffect(() => {
    SecureStore.getItemAsync('themeOverride').then(val => {
      if (val === 'light' || val === 'dark') setThemeOverrideState(val);
    });
  }, []);

  const setThemeOverride = useCallback(async (t: ThemeOverride) => {
    setThemeOverrideState(t);
    if (t) await SecureStore.setItemAsync('themeOverride', t);
    else await SecureStore.deleteItemAsync('themeOverride');
  }, []);

  const isDark = themeOverride ? themeOverride === 'dark' : systemScheme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return React.createElement(ThemeContext.Provider, { value: { colors, isDark, themeOverride, setThemeOverride } }, children);
}

export function useColors(): AppColors {
  return useContext(ThemeContext).colors;
}

export function useTheme() {
  return useContext(ThemeContext);
}
