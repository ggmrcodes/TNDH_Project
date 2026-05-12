import { Platform } from 'react-native';

export const COLORS = {
  // Primary — rich teal with depth
  primary: '#0B6E6E',
  primaryDark: '#074F4F',
  primaryLight: '#E4F5F4',
  primaryMuted: '#B2DFDB',
  primaryGradientStart: '#0B6E6E',
  primaryGradientEnd: '#14A39A',

  // Warm accent — coral/salmon for energy
  accent: '#E8755A',
  accentLight: '#FFF0EC',
  accentMuted: '#F5B8A8',

  // Surfaces
  white: '#FFFFFF',
  background: '#F8F6F2',       // warm cream instead of cold gray
  surface: '#FFFFFF',
  surfaceElevated: '#FEFDFB',   // slightly warm elevated surface

  // Text — warm-tinted neutrals
  text: '#1B2333',              // blue-black instead of pure black
  textSecondary: '#5C6678',     // warm gray
  textLight: '#9BA3B2',         // soft warm gray
  textOnPrimary: '#FFFFFF',

  // Borders — warm tinted
  border: '#DDD9D3',
  borderLight: '#EEEAE5',

  // Clinical status — richer, more saturated
  statusNormal: '#0EA572',
  statusNormalBg: '#E9FBF3',
  statusNormalText: '#054D35',
  statusMonitor: '#E8933A',
  statusMonitorBg: '#FFF7ED',
  statusMonitorText: '#7A4510',
  statusUrgent: '#DC3B3B',
  statusUrgentBg: '#FEF0F0',
  statusUrgentText: '#8B1A1A',

  // Misc
  error: '#DC3B3B',
  success: '#0EA572',
  overlay: 'rgba(27, 35, 51, 0.55)',
  cardBorder: '#E8E4DE',

  // Decorative
  gold: '#D4A853',
  goldLight: '#FFF8E7',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  full: 9999,
} as const;

export const TYPOGRAPHY = {
  h1: {
    fontSize: 30,
    fontWeight: '800' as const,
    lineHeight: 38,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 24,
    fontWeight: '700' as const,
    lineHeight: 30,
    letterSpacing: -0.3,
  },
  h3: {
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  body: {
    fontSize: 15,
    fontWeight: '400' as const,
    lineHeight: 22,
  },
  bodySmall: {
    fontSize: 13,
    fontWeight: '400' as const,
    lineHeight: 18,
  },
  caption: {
    fontSize: 11,
    fontWeight: '500' as const,
    lineHeight: 14,
  },
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    lineHeight: 14,
    letterSpacing: 1,
  },
  button: {
    fontSize: 16,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  // New dramatic scale
  heroNumber: {
    fontSize: 44,
    fontWeight: '800' as const,
    lineHeight: 48,
    letterSpacing: -1,
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '800' as const,
    lineHeight: 30,
    letterSpacing: -0.5,
  },
} as const;

export const SHADOWS = {
  card: Platform.select({
    ios: {
      shadowColor: '#1B2333',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
    android: {
      elevation: 2,
    },
    default: {
      shadowColor: '#1B2333',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
    },
  }),
  elevated: Platform.select({
    ios: {
      shadowColor: '#1B2333',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
    android: {
      elevation: 8,
    },
    default: {
      shadowColor: '#1B2333',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
    },
  }),
  glow: Platform.select({
    ios: {
      shadowColor: '#0B6E6E',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
    android: {
      elevation: 6,
    },
    default: {
      shadowColor: '#0B6E6E',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.2,
      shadowRadius: 12,
    },
  }),
} as const;
