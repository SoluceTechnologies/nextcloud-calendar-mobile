import React from 'react';
import { useTheme } from 'expo-router';
import { StyleSheet, type AccessibilityProps } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import AnimatedPressable from './AnimatedPressable';

type Variant = 'ghost' | 'filled' | 'plain';

interface IconButtonProps extends AccessibilityProps {
  onPress?: () => void;
  size?: number;
  variant?: Variant;
  round?: boolean;
  glass?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
  hapticFeedback?: Haptics.ImpactFeedbackStyle | null;
  testID?: string;
}

function IconButton({
  onPress, size = 44, variant = 'ghost', round = false, glass = false, disabled = false, children,
  hapticFeedback = Haptics.ImpactFeedbackStyle.Light,
  ...accessibility
}: IconButtonProps) {
  const { colors, radius } = useTheme();
  const onGlass = glass && isLiquidGlassAvailable();
  const borderRadius = round ? size / 2 : radius.md;

  return (
    <AnimatedPressable
      {...accessibility}
      onPress={onPress}
      disabled={disabled}
      animated={!disabled}
      hapticFeedback={hapticFeedback ?? undefined}
      style={{
        width: size,
        height: size,
        borderRadius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: onGlass || variant === 'plain' ? 'transparent' : colors.surface,
        borderWidth: onGlass || variant === 'plain' ? 0 : 1.5,
        borderColor: colors.border,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {onGlass && (
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          style={[StyleSheet.absoluteFill, { borderRadius }]}
        />
      )}
      {children}
    </AnimatedPressable>
  );
}

export default React.memo(IconButton);
