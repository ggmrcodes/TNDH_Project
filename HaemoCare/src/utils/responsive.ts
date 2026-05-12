import { useWindowDimensions } from 'react-native';

export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
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
  contentPadding: number;
  contentMaxWidth: number;
}

export function useResponsive(): ResponsiveInfo {
  const { width, height } = useWindowDimensions();

  const deviceSize: DeviceSize =
    width >= BREAKPOINTS.desktop
      ? 'desktop'
      : width >= BREAKPOINTS.tablet
        ? 'tablet'
        : 'mobile';

  const isMobile = deviceSize === 'mobile';
  const isTablet = deviceSize === 'tablet';
  const isDesktop = deviceSize === 'desktop';

  const contentPadding = isDesktop ? 32 : isTablet ? 24 : 16;
  const contentMaxWidth = isDesktop ? MAX_CONTENT_WIDTH : isTablet ? MAX_CONTENT_WIDTH : 9999;

  return {
    width,
    height,
    deviceSize,
    isMobile,
    isTablet,
    isDesktop,
    contentPadding,
    contentMaxWidth,
  };
}
