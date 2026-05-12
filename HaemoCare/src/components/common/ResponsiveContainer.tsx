import React from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { useResponsive, MAX_CONTENT_WIDTH } from '../../utils/responsive';
import { COLORS } from '../../config/theme';

interface ResponsiveContainerProps {
  children: React.ReactNode;
  /** Override max content width */
  maxWidth?: number;
  /** Additional style for the outer wrapper */
  style?: StyleProp<ViewStyle>;
  /** Whether to apply background color to the outer area on desktop */
  withBackground?: boolean;
}

/**
 * Wraps content in a centered, max-width container on larger screens.
 * On mobile, renders children as-is with no wrapper overhead.
 */
export default function ResponsiveContainer({
  children,
  maxWidth = MAX_CONTENT_WIDTH,
  style,
  withBackground = true,
}: ResponsiveContainerProps) {
  const { isMobile } = useResponsive();

  if (isMobile) {
    return <>{children}</>;
  }

  return (
    <View style={[styles.outer, withBackground && styles.outerBg, style]}>
      <View style={[styles.inner, { maxWidth }]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    alignItems: 'center',
  },
  outerBg: {
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    width: '100%',
  },
});
