import { memo } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent } from 'react-native';
import { useTheme } from 'expo-router';
import { FULL_DAY_RANGE, type LaneBlock, type MinuteRange } from '@/features/event/utils/laneLayout';

const FREE_BORDER = '#4caf50';
const UNAVAILABLE_FILL = '#9e9e9e';

export interface LaneSelection {
  startMin: number;
  endMin: number;
  free: boolean;
}

interface AttendeeLaneProps {
  blocks: LaneBlock[];
  pxPerMinute: number;
  height: number;
  /** Visible minute window; blocks/selection are positioned relative to it. */
  range?: MinuteRange;
  /** Draft/selected event position rendered on top of the lane. */
  selection?: LaneSelection | null;
  /** When set, tapping the lane reports the x offset in px. */
  onTap?: (offsetXPx: number) => void;
  /** Greyed-out lane for attendees whose availability could not be fetched. */
  unknown?: boolean;
  testID?: string;
}

function blockColor(fbType: LaneBlock['fbType'], danger: string): string {
  switch (fbType) {
    case 'BUSY':
      return `${danger}8c`;
    case 'BUSY-TENTATIVE':
      return `${danger}4d`;
    case 'BUSY-UNAVAILABLE':
    default:
      return `${UNAVAILABLE_FILL}40`;
  }
}

function AttendeeLaneImpl({
  blocks,
  pxPerMinute,
  height,
  range = FULL_DAY_RANGE,
  selection,
  onTap,
  unknown = false,
  testID,
}: AttendeeLaneProps) {
  const theme = useTheme();
  const rangeStart = range.startMin;
  const width = (range.endMin - range.startMin) * pxPerMinute;

  const content = (
    <View
      testID={testID}
      style={[
        styles.lane,
        {
          width,
          height,
          backgroundColor: theme.colors.card,
          opacity: unknown ? 0.35 : 1,
        },
      ]}
    >
      {blocks.map((block, i) => (
        <View
          key={i}
          style={[
            styles.block,
            {
              left: (block.startMin - rangeStart) * pxPerMinute,
              width: Math.max(1, (block.endMin - block.startMin) * pxPerMinute),
              backgroundColor: blockColor(block.fbType, theme.colors.danger),
            },
          ]}
        />
      ))}
      {selection && (
        <View
          testID={testID ? `${testID}-selection` : 'lane-selection'}
          style={[
            styles.selection,
            {
              left: (selection.startMin - rangeStart) * pxPerMinute,
              width: Math.max(4, (selection.endMin - selection.startMin) * pxPerMinute),
              backgroundColor: `${theme.colors.primary}40`,
              borderColor: selection.free ? FREE_BORDER : theme.colors.danger,
            },
          ]}
        />
      )}
    </View>
  );

  if (!onTap) return content;

  return (
    <Pressable
      onPress={(event: GestureResponderEvent) => onTap(event.nativeEvent.locationX)}
      style={styles.pressable}
    >
      {content}
    </Pressable>
  );
}

export const AttendeeLane = memo(AttendeeLaneImpl);

const styles = StyleSheet.create({
  pressable: {
    alignSelf: 'flex-start',
  },
  lane: {
    position: 'relative',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  block: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    borderRadius: 2,
  },
  selection: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderWidth: 2,
    borderRadius: 4,
  },
});
