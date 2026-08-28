import { memo } from 'react';
import { TouchableOpacity, View, StyleSheet, type ViewStyle } from 'react-native';
import dayjs from 'dayjs';
import { HelpCircle } from 'lucide-react-native';
import { Typography } from '@/ui/components';
import type { GridEvent } from '../utils/toGridEvents';
import { contrastFor } from '../utils/eventInk';

interface Props {
  event: GridEvent;
  top: string;
  height: string;
  leftPct: number;
  widthPct: number;
  zIndex: number;
  hourRowHeight: number;
  dimmed?: boolean;
  onPress: (event: GridEvent) => void;
}

function TimeGridEventImpl({ event, top, height, leftPct, widthPct, zIndex, hourRowHeight, dimmed, onPress }: Props) {
  const scale = Math.min(Math.max((hourRowHeight - 30) / 170, 0), 1);
  const titleSize = Math.round(11 + scale * 4);
  const timeSize = Math.round(9 + scale * 2);
  const pad = Math.round(2 + scale * 4);
  const color = event.color;
  const ink = contrastFor(color);
  const durationMin = dayjs(event.end).diff(event.start, 'minute');

  const positionStyle: ViewStyle = {
    position: 'absolute',
    top: top as ViewStyle['top'],
    height: height as ViewStyle['height'],
    marginTop: 2,
    zIndex,
    left: `${leftPct}%` as ViewStyle['left'],
    width: `${widthPct}%` as ViewStyle['width'],
    opacity: dimmed ? 0.35 : 1,
  };

  return (
    <TouchableOpacity testID={`event-box-${event._event.uid}`} onPress={() => onPress(event)} style={positionStyle}>
      {/* The background/border box, inset from the touch target's right edge by
          marginRight so neighbouring events keep a visible 3px gap — width-based
          sizing (unlike the old right-anchored box) paints to the touch target's
          full width otherwise. */}
      <View
        testID={`event-card-${event._event.uid}`}
        style={[
          styles.card,
          event.isPending && styles.cardPending,
          {
            flex: 1,
            marginRight: 3,
            backgroundColor: color,
            borderColor: ink.border,
            paddingLeft: leftPct > 0 ? 2 : 3,
            paddingRight: 3,
            paddingVertical: Math.max(pad - 1, 1),
          },
        ]}
      >
        {event.isPending && (
          <View style={styles.pendingBadge} pointerEvents="none">
            <HelpCircle size={Math.max(12, titleSize - 2)} color={ink.text} />
          </View>
        )}
        {durationMin < 30 ? (
          <Typography variant="body2" weight="600" color={ink.text} style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.25) }} numberOfLines={1}>
            {event.title}
          </Typography>
        ) : (
          <>
            <Typography variant="body2" weight="600" color={ink.text} style={{ fontSize: titleSize, lineHeight: Math.round(titleSize * 1.25) }} numberOfLines={2}>
              {event.title}
            </Typography>
            <Typography color={ink.subtext} weight="400" style={{ fontSize: timeSize, lineHeight: Math.round(timeSize * 1.25) }} numberOfLines={1}>
              {dayjs(event.start).format('H:mm')}–{dayjs(event.end).format('H:mm')}
            </Typography>
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}

export const TimeGridEvent = memo(TimeGridEventImpl);

const styles = StyleSheet.create({
  card: {
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardPending: {
    borderStyle: 'dotted',
    borderWidth: 2,
    opacity: 0.75,
  },
  pendingBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
});
