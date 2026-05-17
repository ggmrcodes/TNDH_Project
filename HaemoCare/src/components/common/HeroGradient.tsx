import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';

interface HeroGradientProps {
  /** Optional rounded-corners radius. Pair with overflow:'hidden' on the wrapper if you want corner clipping. */
  borderRadius?: number;
  /** Override the gradient ID if multiple gradients render in the same screen (avoid SVG def collisions). */
  gradientId?: string;
  /** Extra wrapper style (e.g. background tint behind the SVG). */
  style?: ViewStyle;
}

/**
 * Brand teal-gradient background for hero cards.
 * Wraps the <Svg> in a View with absoluteFill + pointerEvents='none' so:
 *   (1) the SVG inherits a concrete size and actually fills the parent,
 *   (2) it doesn't intercept touches on content rendered above it.
 *
 * Drop it as the first child of any positioned ('relative') View with
 * overflow:'hidden' to get a full-bleed gradient that respects rounded corners.
 */
export default function HeroGradient({ borderRadius, gradientId = 'heroGrad', style }: HeroGradientProps) {
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, borderRadius ? { borderRadius, overflow: 'hidden' } : undefined, style]}
    >
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor="#074F4F" />
            <Stop offset="45%" stopColor="#0B6E6E" />
            <Stop offset="100%" stopColor="#14A39A" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill={`url(#${gradientId})`} />
      </Svg>
    </View>
  );
}
