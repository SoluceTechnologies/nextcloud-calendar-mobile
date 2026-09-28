import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { useTheme } from 'expo-router';
import { AnimatedPressable, Icon } from '@/ui/components';
import { nativeTabsEnabled } from '@/utils/nativeTabs';

interface Props {
  onPress: () => void;
}

const SOLID_SIZE = 56;
const GLASS_SIZE = 64;

function CalendarFabImpl({ onPress }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (nativeTabsEnabled() && isGlassEffectAPIAvailable()) {
    return (
      <AnimatedPressable
        testID="calendar-fab-new"
        onPress={onPress}
        hapticFeedback={Haptics.ImpactFeedbackStyle.Light}
        style={[
          styles.base,
          {
            right: 16,
            bottom: insets.bottom + 4,
            width: GLASS_SIZE,
            height: GLASS_SIZE,
            borderRadius: GLASS_SIZE / 2,
            overflow: 'hidden',
          },
        ]}
      >
        <GlassView
          glassEffectStyle="regular"
          isInteractive
          tintColor={colors.primary}
          style={StyleSheet.absoluteFill}
        />
        <Icon size={30}>
          <Plus color="#ffffff" />
        </Icon>
      </AnimatedPressable>
    );
  }

  return (
    <AnimatedPressable testID="calendar-fab-new" onPress={onPress} style={[styles.base, styles.solid, { backgroundColor: colors.primary }]}>
      <Icon size={28}>
        <Plus color="#ffffff" />
      </Icon>
    </AnimatedPressable>
  );
}

export const CalendarFab = memo(CalendarFabImpl);

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    right: 20,
    bottom: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  solid: {
    width: SOLID_SIZE,
    height: SOLID_SIZE,
    borderRadius: SOLID_SIZE / 2,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
