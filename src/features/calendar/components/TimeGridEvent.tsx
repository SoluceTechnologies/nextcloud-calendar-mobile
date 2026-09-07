import { memo, useRef } from 'react';
import { TouchableOpacity, View, StyleSheet, type ViewStyle } from 'react-native';
import dayjs from 'dayjs';
import { Typography } from '@/ui/components';
import type { GridEvent } from '../utils/toGridEvents';
import { contrastFor } from '../utils/eventInk';
import { LONG_PRESS_MS } from '../constants';

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

  // A finger that rested here for the long-press window was grabbing the event,
  // not tapping it, so it must not navigate on lift. The drag gesture cannot be
  // relied on to have swallowed that touch: RNGH fails an activateAfterLongPress
  // pan as soon as the finger drifts past the touch slop before the timer fires,
  // and a failed pan never cancels this Touchable underneath it. Without the
  // guard, the common "press, wobble, drag" opens the detail screen instead.
  const pressedAt = useRef(0);

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
    <TouchableOpacity
      testID={`event-box-${event._event.uid}`}
      onPressIn={() => { pressedAt.current = Date.now(); }}
      onPress={() => {
        if (Date.now() - pressedAt.current < LONG_PRESS_MS) onPress(event);
      }}
      style={positionStyle}
    >
      {/* The background/border box, inset from the touch target's right edge by
          marginRight so neighbouring events keep a visible 3px gap — width-based
          sizing (unlike the old right-anchored box) paints to the touch target's
          full width otherwise. */}
      <View
        testID={`event-card-${event._event.uid}`}
        style={[
          styles.card,
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
});
