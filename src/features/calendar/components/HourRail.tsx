import { memo } from 'react';
import { View, Text } from 'react-native';
import { useTheme } from 'expo-router';
import { useTimeFormat } from '@/hooks/useTimeFormat';
import { HOUR_RAIL_WIDTH } from '../utils/grid';

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function HourRailImpl() {
  const { colors } = useTheme();
  const { formatHour } = useTimeFormat();
  return (
    <View style={{ width: HOUR_RAIL_WIDTH, zIndex: 20, backgroundColor: colors.background }}>
      {HOURS.map((hour) => (
        <View key={hour} testID={`hour-block-${hour}`} style={{ flex: 1 }}>
          <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center' }}>
            {formatHour(hour)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export const HourRail = memo(HourRailImpl);
