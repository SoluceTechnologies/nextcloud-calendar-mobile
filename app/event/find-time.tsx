import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { ZoomIn, ZoomOut } from 'lucide-react-native';
import {
  Button, IconButton, ScreenHeader, Spinner, Stack, Toggle, Typography, ViewContainer,
} from '@/ui/components';
import { useFreeBusy, type FindTimeMode } from '@/features/event/hooks/useFreeBusy';
import { useFindTimeStore, type FindTimeRequest } from '@/features/event/stores/findTimeStore';
import { AttendeeLane } from '@/features/event/components/AttendeeLane';
import { DayStrip } from '@/features/event/components/DayStrip';
import {
  FULL_DAY_RANGE, blocksForDay, hourMarks, minutesSinceMidnight, slotFromLaneTap,
  workingRangeForDay,
} from '@/features/event/utils/laneLayout';
import { isSlotFree } from '@/utils/freeBusy';
import type { SuggestedSlot } from '@/types';

dayjs.extend(localizedFormat);

const RAIL_WIDTH = 96;
const AXIS_HEIGHT = 28;
const MERGED_LANE_HEIGHT = 56;
const LANE_HEIGHT = 44;
const ZOOM_LEVELS = [0.5, 1, 2];

export default function FindTimeScreen() {
  const request = useFindTimeStore((s) => s.request);
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <ViewContainer>
      <SafeAreaView style={styles.flex}>
        <ScreenHeader title={t('event.findTimeTitle')} onBack={() => router.back()} />
        {request ? (
          <FindTimeView request={request} />
        ) : (
          <Stack flex vAlign="center" hAlign="center">
            <Typography variant="body1" color="secondary">
              {t('event.findTimeNoRequest')}
            </Typography>
          </Stack>
        )}
      </SafeAreaView>
    </ViewContainer>
  );
}

function FindTimeView({ request }: { request: FindTimeRequest }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const router = useRouter();
  const setResult = useFindTimeStore((s) => s.setResult);

  const [mode, setMode] = useState<FindTimeMode>(request.mode);
  const [workingOnly, setWorkingOnly] = useState(true);
  const [zoomIndex, setZoomIndex] = useState(1);
  const pxPerMinute = ZOOM_LEVELS[zoomIndex];

  const [selectedDay, setSelectedDay] = useState<Date>(() => {
    const d = new Date(request.start);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [draft, setDraft] = useState<SuggestedSlot>({ start: request.start, end: request.end });

  const durationMs = draft.end.getTime() - draft.start.getTime();

  const { loading, error, availabilities, mergedBusy, searchStart, searchEnd, refetch } =
    useFreeBusy({
      account: request.account,
      organizer: request.organizer,
      attendees: request.attendees,
      start: draft.start,
      end: draft.end,
      mode,
      requiredAttendees: request.requiredAttendees,
    });

  const days = useMemo(() => {
    if (!searchStart || !searchEnd) return [];
    const count = Math.max(1, dayjs(searchEnd).diff(searchStart, 'day'));
    return Array.from({ length: count }, (_, i) => dayjs(searchStart).add(i, 'day').toDate());
  }, [searchStart, searchEnd]);

  // Working-hours window for the selected day, derived from the attendees
  // taken into account by the current mode (same filter as mergedBusy).
  const range = useMemo(() => {
    if (!workingOnly) return FULL_DAY_RANGE;
    const effective = mode === 'strict'
      ? availabilities
      : availabilities.filter((a) => a.required);
    return workingRangeForDay(effective, selectedDay);
  }, [workingOnly, mode, availabilities, selectedDay]);

  const mergedBlocks = useMemo(
    () => blocksForDay(mergedBusy, selectedDay, range),
    [mergedBusy, selectedDay, range],
  );
  const attendeeBlocks = useMemo(
    () => availabilities.map((a) => blocksForDay(a.slots, selectedDay, range)),
    [availabilities, selectedDay, range],
  );

  const draftOnSelectedDay = dayjs(draft.start).isSame(dayjs(selectedDay), 'day');
  const draftFree = isSlotFree(draft, mergedBusy);
  const selStart = minutesSinceMidnight(draft.start);
  const selEnd = selStart + durationMs / 60_000;
  const selection =
    draftOnSelectedDay && selEnd > range.startMin && selStart < range.endMin
      ? {
          startMin: Math.max(selStart, range.startMin),
          endMin: Math.min(selEnd, range.endMin),
          free: draftFree,
        }
      : null;

  const hasData = !loading && !error && availabilities.length > 0;

  const laneWidth = (range.endMin - range.startMin) * pxPerMinute;
  const laneScrollRef = useRef<ScrollView>(null);
  const marks = hourMarks(pxPerMinute, range);

  // Keep the draft (or the range start when the draft is on another day) in view.
  const scrollLanesToFocus = useCallback(() => {
    const focusMin = draftOnSelectedDay
      ? minutesSinceMidnight(draft.start)
      : range.startMin + 120;
    const offset = Math.max(0, (focusMin - range.startMin) * pxPerMinute - 60);
    laneScrollRef.current?.scrollTo({ x: offset, animated: false });
  }, [draftOnSelectedDay, draft.start, pxPerMinute, range.startMin]);

  useEffect(() => {
    const raf = requestAnimationFrame(scrollLanesToFocus);
    return () => cancelAnimationFrame(raf);
  }, [scrollLanesToFocus, selectedDay, hasData]);

  function handleLaneTap(offsetX: number) {
    const slot = slotFromLaneTap(offsetX, pxPerMinute, selectedDay, durationMs, range.startMin);
    if (slot) setDraft(slot);
  }

  function handleApply() {
    if (!draftFree) return;
    setResult(draft);
    router.back();
  }

  return (
    <View style={styles.flex}>
      <View style={styles.controlsRow}>
        <View style={styles.modeRow}>
          <Typography variant="body2" color="secondary">
            {t('event.findTimeEveryoneMustBeFree')}
          </Typography>
          <Toggle
            testID="find-time-mode-toggle"
            value={mode === 'strict'}
            onValueChange={(v) => setMode(v ? 'strict' : 'permissive')}
          />
        </View>
        <View style={styles.zoomRow}>
          <IconButton
            size={32}
            variant="plain"
            disabled={zoomIndex === 0}
            onPress={() => setZoomIndex((i) => Math.max(0, i - 1))}
            accessibilityLabel={t('event.findTimeZoomOut')}
          >
            <ZoomOut size={18} color={theme.colors.text} />
          </IconButton>
          <IconButton
            size={32}
            variant="plain"
            disabled={zoomIndex === ZOOM_LEVELS.length - 1}
            onPress={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
            accessibilityLabel={t('event.findTimeZoomIn')}
          >
            <ZoomIn size={18} color={theme.colors.text} />
          </IconButton>
        </View>
      </View>

      <View style={styles.workingRow}>
        <Typography variant="body2" color="secondary" style={styles.flex}>
          {t('event.findTimeWorkingHoursOnly')}
        </Typography>
        <Toggle
          testID="find-time-working-hours"
          value={workingOnly}
          onValueChange={setWorkingOnly}
        />
      </View>

      {loading && (
        <Stack flex vAlign="center" hAlign="center">
          <Spinner size="large" color="primary" />
          <Typography variant="body2" color="secondary" style={styles.marginTop}>
            {t('event.findTimeLoading')}
          </Typography>
        </Stack>
      )}

      {!loading && error && (
        <Stack flex vAlign="center" hAlign="center">
          <Typography variant="body2" color="danger">
            {t('event.findTimeError')}
          </Typography>
          <Typography variant="caption" color="secondary" style={styles.marginTop}>
            {error.message}
          </Typography>
          <Button
            variant="secondary"
            title={t('event.findTimeRetry')}
            onPress={refetch}
            style={styles.marginTop}
          />
        </Stack>
      )}

      {hasData && (
        <>
          <DayStrip days={days} selectedDay={selectedDay} onSelect={setSelectedDay} />

          <ScrollView style={styles.flex} contentContainerStyle={styles.lanesContent}>
            <View style={styles.lanesRow}>
              {/* Fixed name rail */}
              <View style={{ width: RAIL_WIDTH }}>
                <View style={{ height: AXIS_HEIGHT }} />
                <View style={[styles.railLabel, { height: MERGED_LANE_HEIGHT }]}>
                  <Typography variant="body2" weight="600">
                    {t('event.findTimeEveryoneLane')}
                  </Typography>
                </View>
                {availabilities.map((a) => (
                  <View key={a.email} style={[styles.railLabel, { height: LANE_HEIGHT }]}>
                    <View style={[styles.dot, { backgroundColor: a.color }]} />
                    <Typography variant="caption" numberOfLines={1} style={styles.railName}>
                      {a.displayName ?? a.email.split('@')[0]}
                    </Typography>
                    {!a.available && (
                      <Typography variant="caption" color="secondary">
                        {'?'}
                      </Typography>
                    )}
                  </View>
                ))}
              </View>

              {/* Horizontally scrollable lanes */}
              <ScrollView
                ref={laneScrollRef}
                horizontal
                showsHorizontalScrollIndicator
                scrollEventThrottle={16}
                onContentSizeChange={scrollLanesToFocus}
                style={styles.flex}
              >
                <View style={{ width: laneWidth }}>
                  {/* Hour axis */}
                  <View style={[styles.axis, { height: AXIS_HEIGHT, width: laneWidth }]}>
                    {marks.map((m) => (
                      <Typography
                        key={m}
                        variant="caption"
                        color="secondary"
                        style={[styles.axisLabel, { left: (m - range.startMin) * pxPerMinute }]}
                      >
                        {`${Math.floor(m / 60)}:00`}
                      </Typography>
                    ))}
                  </View>

                  <AttendeeLane
                    testID="lane-merged"
                    blocks={mergedBlocks}
                    pxPerMinute={pxPerMinute}
                    height={MERGED_LANE_HEIGHT}
                    range={range}
                    selection={selection}
                    onTap={handleLaneTap}
                  />
                  {availabilities.map((a, i) => (
                    <AttendeeLane
                      key={a.email}
                      testID={`lane-${i}`}
                      blocks={attendeeBlocks[i]}
                      pxPerMinute={pxPerMinute}
                      height={LANE_HEIGHT}
                      range={range}
                      unknown={!a.available}
                    />
                  ))}
                </View>
              </ScrollView>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: theme.colors.border }]}>
            <Typography variant="caption" color="secondary">
              {t('event.findTimeTapHint')}
            </Typography>
            <Typography variant="body2" style={styles.selectedLabel} testID="find-time-selection">
              {dayjs(draft.start).format('ddd ll')} · {dayjs(draft.start).format('LT')} –{' '}
              {dayjs(draft.end).format('LT')}
            </Typography>
            <Button
              variant="primary"
              title={t('event.findTimeApply')}
              disabled={!draftFree}
              onPress={handleApply}
              testID="find-time-apply"
            />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  marginTop: { marginTop: 8 },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 12,
  },
  modeRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  zoomRow: {
    flexDirection: 'row',
    gap: 4,
  },
  workingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  lanesContent: {
    paddingBottom: 12,
  },
  lanesRow: {
    flexDirection: 'row',
  },
  railLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  railName: {
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  axis: {
    position: 'relative',
  },
  axisLabel: {
    position: 'absolute',
    top: 4,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
  selectedLabel: {
    marginVertical: 2,
  },
});
