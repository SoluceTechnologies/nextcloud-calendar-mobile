import { memo } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import dayjs from 'dayjs';

interface Props {
  event: any;
  touchableProps: any;
  hourRowHeight: number;
  primaryColor: string;
}

function TimeGridEventImpl({ event, touchableProps, hourRowHeight, primaryColor }: Props) {
  const scale = Math.min(Math.max((hourRowHeight - 30) / 170, 0), 1);
  const titleSize = Math.round(10 + scale * 4);
  const timeSize = Math.round(9 + scale * 2);
  const pad = Math.round(2 + scale * 4);
  const color = event.color ?? primaryColor;
  const durationMin = dayjs(event.end).diff(event.start, 'minute');

  const leftPct: number = event._leftPct ?? 0;
  const rightPx: number = event._rightPx ?? 3;
  const zIdx: number = event._zIndex ?? 100;

  const libStyle = StyleSheet.flatten(touchableProps.style) as any;

  const positionStyle = {
    position: 'absolute' as const,
    height: libStyle.height,
    top: libStyle.top,
    marginTop: libStyle.marginTop ?? 2,
    zIndex: zIdx,
    left: `${leftPct}%` as any,
    right: rightPx,
    paddingLeft: leftPct > 0 ? 2 : 3,
    paddingRight: 3,
  };

  return (
    <TouchableOpacity
      {...touchableProps}
      style={[positionStyle, styles.card, { backgroundColor: color, paddingVertical: Math.max(pad - 1, 1) }]}
    >
      {durationMin < 30 ? (
        <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1}>
          {event.title}
        </Text>
      ) : (
        <>
          <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={[styles.time, { fontSize: timeSize }]} numberOfLines={1}>
            {dayjs(event.start).format('H:mm')}–{dayjs(event.end).format('H:mm')}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

export const TimeGridEvent = memo(TimeGridEventImpl);

const styles = StyleSheet.create({
  card: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    overflow: 'hidden',
  },
  title: { color: '#fff', fontWeight: '600' },
  time: { color: 'rgba(255,255,255,0.85)' },
});
