import React, { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

const DURATION_MS = 280;

type Variant = 'fade' | 'fadeDown';

/**
 * Subtle mount animation for screen content. Respects Reduce Motion.
 */
export function ScreenEnterAnimation({
  children,
  variant = 'fadeDown',
}: {
  children: React.ReactNode;
  variant?: Variant;
}) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  if (reduceMotion) {
    return <>{children}</>;
  }

  const entering =
    variant === 'fade'
      ? FadeIn.duration(DURATION_MS)
      : FadeInDown.duration(DURATION_MS);

  return (
    <Animated.View entering={entering} style={{ flex: 1 }} pointerEvents="box-none">
      {children}
    </Animated.View>
  );
}
