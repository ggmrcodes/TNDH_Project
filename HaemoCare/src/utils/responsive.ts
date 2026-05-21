import { useEffect, useState } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1100,
} as const;

export const MAX_CONTENT_WIDTH = 600;
export const MAX_WIDE_CONTENT_WIDTH = 960;

export type DeviceSize = 'mobile' | 'tablet' | 'desktop';

export interface ResponsiveInfo {
  width: number;
  height: number;
  deviceSize: DeviceSize;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isWide: boolean;
  contentPadding: number;
  contentMaxWidth: number;
}

/**
 * On web, React Native's `useWindowDimensions` returns stale/0 values during
 * Expo's static pre-render and doesn't reliably re-update after hydration,
 * leaving `isDesktop` permanently false even on wide windows. Use the
 * native `window` directly with a resize listener on web; defer to RN's
 * hook elsewhere.
 */
function useWebSafeDimensions(): { width: number; height: number } {
  const native = useWindowDimensions();
  const [web, setWeb] = useState(() =>
    typeof window !== 'undefined'
      ? { width: window.innerWidth, height: window.innerHeight }
      : { width: 0, height: 0 }
  );
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    // Sync once on mount (covers the SSR→hydration gap) then track resizes.
    setWeb({ width: window.innerWidth, height: window.innerHeight });
    const onResize = () =>
      setWeb({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return Platform.OS === 'web' ? web : native;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWebSafeDimensions();

  const deviceSize: DeviceSize =
    width >= BREAKPOINTS.desktop
      ? 'desktop'
      : width >= BREAKPOINTS.tablet
        ? 'tablet'
        : 'mobile';

  const isMobile = deviceSize === 'mobile';
  const isTablet = deviceSize === 'tablet';
  const isDesktop = deviceSize === 'desktop';
  const isWide = width >= BREAKPOINTS.wide;

  const contentPadding = isDesktop ? 32 : isTablet ? 24 : 16;
  const contentMaxWidth = isDesktop ? MAX_CONTENT_WIDTH : isTablet ? MAX_CONTENT_WIDTH : 9999;

  return {
    width,
    height,
    deviceSize,
    isMobile,
    isTablet,
    isDesktop,
    isWide,
    contentPadding,
    contentMaxWidth,
  };
}
