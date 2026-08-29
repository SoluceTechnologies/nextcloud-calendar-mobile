import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, StyleSheet,
  useWindowDimensions,
} from 'react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import InfinitePager, { type InfinitePagerImperativeApi } from 'react-native-infinite-pager';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { isEventPending } from '@/utils/eventPending';
import type { CalendarEvent } from '@/types';

dayjs.extend(localizedFormat);

// Jumps within this many months slide (animated); farther ones re-anchor
// instantly rather than spring across a long stretch of empty months.
const MAX_ANIMATED_JUMP_MONTHS = 2;

interface Props {
  date: Date;
  events: CalendarEvent[];
  weekStartsOn: 0 | 1;
  jump: { nonce: number; target: Date };
  onSelectDate: (d: Date) => void;
  onMonthChange: (d: Date) => void;
  onPressEvent: (e: CalendarEvent) => void;
  onPressCell: (d: Date) => void;
}

export function buildMonthGrid(year: number, month: number, weekStartsOn: 0 | 1): (dayjs.Dayjs | null)[][] {
  const firstOfMonth = dayjs(new Date(year, month, 1));

  const offset = (firstOfMonth.day() - weekStartsOn + 7) % 7;

  const rows: (dayjs.Dayjs | null)[][] = [];
  let cursor = firstOfMonth.subtract(offset, 'day');
  for (let row = 0; row < 6; row++) {
    const week: (dayjs.Dayjs | null)[] = [];
    for (let col = 0; col < 7; col++) {
      week.push(cursor.month() === month ? cursor : null);
      cursor = cursor.add(1, 'day');
    }
    const allNull = week.every((d) => d === null);
    if (allNull) break;
    rows.push(week);
    if (cursor.month() !== month && row >= 3) break;
  }
  return rows;
}

function lastDayOf(e: CalendarEvent): dayjs.Dayjs {
  const end = dayjs(e.dtend);
  if (e.allDay) return end.startOf('day');
  return (end.isSame(end.startOf('day')) ? end.subtract(1, 'millisecond') : end).startOf('day');
}

export function eventDayKeys(e: CalendarEvent): string[] {
  const start = dayjs(e.dtstart);
  const startKey = start.format('YYYY-MM-DD');
  const endDay = lastDayOf(e);
  const keys: string[] = [];
  let cur = start.startOf('day');
  while (!cur.isAfter(endDay, 'day') && keys.length <= 366) {
    keys.push(cur.format('YYYY-MM-DD'));
    cur = cur.add(1, 'day');
  }
  return keys.length ? keys : [startKey];
}

export function eventCoversDay(e: CalendarEvent, dayKey: string): boolean {
  const startKey = dayjs(e.dtstart).format('YYYY-MM-DD');
  const endKey = lastDayOf(e).format('YYYY-MM-DD');
  return dayKey >= startKey && dayKey <= (endKey < startKey ? startKey : endKey);
}

function monthDiff(from: Date, to: Date): number {
  return (dayjs(to).year() - dayjs(from).year()) * 12 + (dayjs(to).month() - dayjs(from).month());
}

interface MonthGridProps {
  weeks: (dayjs.Dayjs | null)[][];
  selected: dayjs.Dayjs;
  today: dayjs.Dayjs;
  dotMap: Map<string, Set<string>>;
  colors: ReturnType<typeof useTheme>['colors'];
  onDayPress: (d: dayjs.Dayjs) => void;
  onPressCell: (d: Date) => void;
}

// One month's 6-week grid. Rendered per pager page so a horizontal swipe slides a
// full month in and out under the finger instead of the old swipe-then-jump.
const MonthGrid = memo(function MonthGrid({
  weeks, selected, today, dotMap, colors, onDayPress, onPressCell,
}: MonthGridProps) {
  return (
    <View style={styles.monthPage}>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((d, di) => {
            if (d === null) {
              return <View key={di} style={styles.dayCell} />;
            }
            const key = d.format('YYYY-MM-DD');
            const isToday = d.isSame(today, 'day');
            const isSelected = d.isSame(selected, 'day');
            const dots = Array.from(dotMap.get(key) ?? []).slice(0, 3);

            return (
              <TouchableOpacity
                key={di}
                style={styles.dayCell}
                onPress={() => onDayPress(d)}
                onLongPress={() => onPressCell(d.toDate())}
              >
                <View style={[
                  styles.dayCircle,
                  { backgroundColor: isSelected ? colors.primary : 'transparent' },
                  { borderWidth: isToday && !isSelected ? 1.5 : 0, borderColor: colors.primary },
                ]}>
                  <Text
                    numberOfLines={1}
                    allowFontScaling={false}
                    style={[
                      styles.dayNumber,
                      { color: isSelected
                        ? colors.primaryText
                        : isToday
                          ? colors.primary
                          : colors.text, fontWeight: isSelected || isToday ? '700' : '400' },
                    ]}>
                    {d.date()}
                  </Text>
                </View>
                <View style={styles.dotsRow}>
                  {dots.map((color, ci) => (
                    <View key={ci} style={[styles.dot, { backgroundColor: color }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
});

function MonthDayViewImpl({ date, events, weekStartsOn, jump, onSelectDate, onMonthChange, onPressEvent, onPressCell }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const activeAccount = useActiveAccount(activeAccountId);
  const { height } = useWindowDimensions();

  const selected = useMemo(() => dayjs(date), [date]);

  const dotMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const add = (key: string, color: string) => {
      let set = map.get(key);
      if (!set) { set = new Set(); map.set(key, set); }
      set.add(color);
    };

    for (const ev of events) {
      for (const key of eventDayKeys(ev)) add(key, ev.color);
    }
    return map;
  }, [events]);

  const dayEvents = useMemo(() => {
    const sel = selected.format('YYYY-MM-DD');
    return events
      .filter((e) => eventCoversDay(e, sel))
      .sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
  }, [events, selected]);

  const todayKey = dayjs().format('YYYY-MM-DD');
  const today = useMemo(() => dayjs(todayKey), [todayKey]);

  const handleDayPress = useCallback((d: dayjs.Dayjs) => {
    onSelectDate(d.toDate());
  }, [onSelectDate]);

  const dayHeaders = useMemo(() => {
    const headers: string[] = [];
    for (let i = 0; i < 7; i++) {
      const dow = (weekStartsOn + i) % 7;
      headers.push(dayjs().day(dow).locale(language).format('dd'));
    }
    return headers;
  }, [weekStartsOn, language]);

  const gridHeight = height * 0.44;

  // The pager pages by whole months: page `index` renders the month `index`
  // months from `localAnchor`. localAnchor is only reset on an external jump
  // (Today button, mode switch); ordinary swiping runs the index up and down
  // without re-anchoring, so paging never fights its own state.
  const [localAnchor, setLocalAnchor] = useState(date);
  const [pagerKey, setPagerKey] = useState(0);
  const pagerRef = useRef<InfinitePagerImperativeApi>(null);
  const localAnchorRef = useRef(localAnchor); localAnchorRef.current = localAnchor;
  const settledIndexRef = useRef(0);
  // Target index of an in-flight programmatic jump; while set, page-change
  // callbacks are the animation crossing months, not a user swipe, so they must
  // not report a month change (the parent already holds the jumped-to date).
  const jumpTargetRef = useRef<number | null>(null);

  // Re-anchor remounts the pager on a fresh key. A far jump's setPage would
  // write `translate` across a gap wider than the page buffer, leaving the
  // mounted pages several widths off-screen (blank) until curIndex caught up a
  // frame later. A remounted pager comes up at index 0 with translate 0,
  // consistent from its first commit. useLayoutEffect, not useEffect: the render
  // that carries the new anchor still sits on the old index, so it must not
  // paint — landing page 0 before paint removes the blank frame.
  const firstAnchorReset = useRef(true);
  useLayoutEffect(() => {
    if (firstAnchorReset.current) { firstAnchorReset.current = false; return; }
    settledIndexRef.current = 0;
    setPagerKey((k) => k + 1);
  }, [localAnchor]);

  const firstJump = useRef(true);
  useEffect(() => {
    if (firstJump.current) { firstJump.current = false; return; }
    const target = monthDiff(localAnchorRef.current, jump.target);
    const from = settledIndexRef.current;
    // Ignore jumps that land on the month already shown (e.g. tapping a day in
    // the current month).
    if (target === from) return;
    // Near jump (Today from a nearby month): slide to it like the other views.
    // At most MAX_ANIMATED_JUMP_MONTHS so the spring never crosses a page the
    // buffer has not mounted yet.
    if (Math.abs(target - from) <= MAX_ANIMATED_JUMP_MONTHS) {
      jumpTargetRef.current = target;
      settledIndexRef.current = target;
      pagerRef.current?.setPage(target, { animated: true });
      return;
    }
    // Too far to animate: re-anchor. The layout effect above remounts the pager
    // at index 0 on the new anchor, swapping months in a single commit rather
    // than blanking while the pager catches up.
    setLocalAnchor(jump.target);
  }, [jump]);

  const handlePageChange = useCallback((index: number) => {
    const prev = settledIndexRef.current;
    settledIndexRef.current = index;
    if (jumpTargetRef.current !== null) {
      if (index === jumpTargetRef.current) jumpTargetRef.current = null;
      return;
    }
    // InfinitePager emits the current page once on mount (and after a remount);
    // that echo is not a swipe. Only a real change of page reports a new month,
    // which also avoids a setState firing into the parent's render.
    if (index === prev) return;
    onMonthChange(dayjs(localAnchorRef.current).add(index, 'month').startOf('month').toDate());
  }, [onMonthChange]);

  const renderPage = useCallback(({ index }: { index: number }) => {
    const m = dayjs(localAnchor).add(index, 'month');
    const weeks = buildMonthGrid(m.year(), m.month(), weekStartsOn);
    return (
      <MonthGrid
        weeks={weeks}
        selected={selected}
        today={today}
        dotMap={dotMap}
        colors={theme.colors}
        onDayPress={handleDayPress}
        onPressCell={onPressCell}
      />
    );
  }, [localAnchor, weekStartsOn, selected, today, dotMap, theme.colors, handleDayPress, onPressCell]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={[styles.grid, { height: gridHeight, borderBottomColor: theme.colors.border }]}>
        <View style={styles.dowRow}>
          {dayHeaders.map((d, i) => (
            <Text key={i} style={[styles.dowLabel, { color: theme.colors.textTertiary }]}>{d}</Text>
          ))}
        </View>

        <View style={styles.pagerWrap}>
          <InfinitePager
            key={pagerKey}
            ref={pagerRef}
            style={styles.fill}
            pageWrapperStyle={styles.fill}
            renderPage={renderPage}
            onPageChange={handlePageChange}
            pageBuffer={1}
          />
        </View>
      </View>

      <View style={styles.dayList}>
        <Text style={[styles.dayListHeader, { color: theme.colors.textSecondary }]}>
          {selected.locale(language).format('dddd, LL')}
        </Text>
        {dayEvents.length === 0 ? (
          <Text style={[styles.emptyText, { color: theme.colors.textTertiary }]}>{t('calendar.noEvents')}</Text>
        ) : (
          <FlatList
            data={dayEvents}
            keyExtractor={(e, i) => `${e.calendarId}-${e.uid}-${e.dtstart.getTime()}-${i}`}
            renderItem={({ item }) => {
              const pending = isEventPending(item, activeAccount);
              return (
                <TouchableOpacity
                  style={[
                    styles.eventRow,
                    pending && styles.eventRowPending,
                    { borderLeftColor: item.color, backgroundColor: theme.colors.surface },
                  ]}
                  onPress={() => onPressEvent(item)}
                >
                  <View style={[styles.eventColorBar, { backgroundColor: item.color }]} />
                  <View style={styles.eventInfo}>
                    <Text style={[styles.eventTitle, { color: theme.colors.text }]} numberOfLines={1}>
                      {item.summary}
                    </Text>
                    <Text style={[styles.eventTime, { color: theme.colors.textSecondary }]}>
                      {item.allDay
                        ? t('calendar.allDay')
                        : `${dayjs(item.dtstart).locale(language).format('LT')} – ${dayjs(item.dtend).locale(language).format('LT')}`}
                    </Text>
                  </View>
                  {pending && (
                    <View style={styles.pendingDot}>
                      <View style={[styles.pendingDotInner, { backgroundColor: theme.colors.danger }]} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            }}
            contentContainerStyle={{ paddingBottom: 16 }}
          />
        )}
      </View>
    </View>
  );
}

export const MonthDayView = memo(MonthDayViewImpl);

const styles = StyleSheet.create({
  container: { flex: 1 },
  fill: { flex: 1 },
  grid: { borderBottomWidth: StyleSheet.hairlineWidth },
  dowRow: { flexDirection: 'row', paddingVertical: 6 },
  dowLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  pagerWrap: { flex: 1 },
  monthPage: { flex: 1 },
  weekRow: { flex: 1, flexDirection: 'row' },
  dayCell: { flex: 1, alignItems: 'center', paddingTop: 2 },
  dayCircle: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontSize: 14, textAlign: 'center' },
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dayList: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  dayListHeader: { fontSize: 13, fontWeight: '600', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyText: { fontSize: 15, textAlign: 'center', marginTop: 32 },
  eventRow: { flexDirection: 'row', borderRadius: 8, marginBottom: 8, overflow: 'hidden' },
  eventRowPending: {
    borderStyle: 'dotted',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.15)',
    opacity: 0.85,
  },
  eventColorBar: { width: 4 },
  pendingDot: { justifyContent: 'center', paddingRight: 10 },
  pendingDotInner: { width: 10, height: 10, borderRadius: 5 },
  eventInfo: { flex: 1, padding: 10 },
  eventTitle: { fontSize: 15, fontWeight: '500' },
  eventTime: { fontSize: 12, marginTop: 2 },
});
