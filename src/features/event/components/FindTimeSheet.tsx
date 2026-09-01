import { useState, useMemo, useRef, useEffect } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { Sheet, Stack, Typography, Spinner, Button, Toggle } from '@/ui/components';
import { useFreeBusy, type FindTimeMode } from '@/features/event/hooks/useFreeBusy';
import {
  AvailabilityTimelineHeader,
  AvailabilityTimelineBody,
} from '@/features/event/components/AvailabilityTimeline';
import { useSyncedHorizontalScroll } from '@/features/event/hooks/useSyncedHorizontalScroll';
import type { Account, Attendee, SuggestedSlot } from '@/types';

const HOUR_RAIL_WIDTH = 56;

dayjs.extend(localizedFormat);

interface Props {
  visible: boolean;
  onClose: () => void;
  account: Account;
  organizer: Attendee;
  attendees: Attendee[];
  start: Date;
  end: Date;
  eventTitle?: string;
  onApplySlot: (slot: SuggestedSlot) => void;
}

export function FindTimeSheet({
  visible,
  onClose,
  account,
  organizer,
  attendees,
  start,
  end,
  eventTitle,
  onApplySlot,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { width: screenWidth } = useWindowDimensions();
  const [draftSlot, setDraftSlot] = useState<SuggestedSlot | null>(null);
  const [mode, setMode] = useState<FindTimeMode>('strict');

  // When the sheet is reopened, discard any previously applied slot so the
  // timeline starts from the event's current start/end.
  useEffect(() => {
    if (visible) {
      setDraftSlot(null);
    }
  }, [visible]);
  const [requiredAttendees, setRequiredAttendees] = useState<string[]>(() =>
    attendees.map((a) => a.email.toLowerCase()),
  );

  const sheetScrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const maxScrollY = Math.max(0, contentHeight - viewportHeight);

  const { headerScrollRef, gridScrollRef, onHeaderScroll, onGridScroll, scrollBothTo } =
    useSyncedHorizontalScroll();

  const attendeeKey = useMemo(
    () => attendees.map((a) => a.email.toLowerCase()).join(','),
    [attendees],
  );

  useEffect(() => {
    // When the attendee list changes, reset to all required by default.
    setRequiredAttendees(attendees.map((a) => a.email.toLowerCase()));
  }, [attendeeKey]);

  const currentStart = draftSlot?.start ?? start;
  const currentEnd = draftSlot?.end ?? end;

  const { loading, error, availabilities, refetch, mergedBusy, searchStart, searchEnd } = useFreeBusy({
    account,
    organizer,
    attendees,
    start: currentStart,
    end: currentEnd,
    enabled: visible,
    mode,
    requiredAttendees,
  });

  const toggleRequired = (email: string) => {
    const emailLower = email.toLowerCase();
    setRequiredAttendees((prev) =>
      prev.includes(emailLower)
        ? prev.filter((e) => e !== emailLower)
        : [...prev, emailLower],
    );
  };

  const attendeeColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of attendees) {
      map[a.email.toLowerCase()] =
        availabilities.find((av) => av.email.toLowerCase() === a.email.toLowerCase())?.color ?? '';
    }
    return map;
  }, [attendees, availabilities]);

  const attendeeNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of attendees) {
      map[a.email.toLowerCase()] = a.displayName ?? a.email;
    }
    return map;
  }, [attendees]);

  const durationMs = currentEnd.getTime() - currentStart.getTime();
  const hourRowHeight = 40;
  const columnWidth = (screenWidth - HOUR_RAIL_WIDTH - 16) / 3;

  // Use the window actually returned by useFreeBusy so the timeline never asks
  // for busy data outside the already loaded range.
  const days = useMemo(() => {
    if (!searchStart || !searchEnd) return [];
    const anchorDay = dayjs(searchStart).startOf('day');
    const count = dayjs(searchEnd).diff(searchStart, 'day');
    return Array.from({ length: Math.max(1, count) }, (_, index) =>
      anchorDay.add(index, 'day').toDate(),
    );
  }, [searchStart, searchEnd]);

  const initialColumnIndex = useMemo(() => {
    const startDay = dayjs(currentStart).startOf('day');
    return days.findIndex((d) => dayjs(d).startOf('day').isSame(startDay));
  }, [days, currentStart]);

  const hasData = !loading && !error && (mergedBusy.length > 0 || availabilities.length > 0);

  // Sync the day header and the grid horizontally, and scroll to the event's day.
  // Re-run when the sheet becomes visible AND when data finishes loading, because
  // the timeline ScrollView only mounts after hasData becomes true — so the refs
  // are not ready in the same render cycle that initialColumnIndex is computed.
  useEffect(() => {
    if (!visible || !hasData || initialColumnIndex < 0) return;
    const offset = Math.max(0, (initialColumnIndex - 1) * columnWidth);
    const raf = requestAnimationFrame(() => {
      if (!visible || !hasData || initialColumnIndex < 0) return;
      scrollBothTo(offset);
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, hasData, initialColumnIndex, columnWidth, scrollBothTo]);

  // Scroll the sheet so the initial event brick is vertically centered.
  useEffect(() => {
    if (!visible || !sheetScrollRef.current || viewportHeight <= 0 || contentHeight <= 0) return;
    const startMin = currentStart.getHours() * 60 + currentStart.getMinutes();
    const durationMin = durationMs / 60_000;
    const brickTop = startMin * (hourRowHeight / 60);
    const brickHeight = durationMin * (hourRowHeight / 60);
    const brickCenter = brickTop + brickHeight / 2;
    const headerOffset = 120;
    const targetY = Math.max(0, Math.min(maxScrollY, brickCenter - viewportHeight / 2 + headerOffset));
    sheetScrollRef.current.scrollTo({ y: targetY, animated: false });
    scrollY.current = targetY;
  }, [visible, currentStart, durationMs, viewportHeight, contentHeight, hourRowHeight, maxScrollY]);

  const stickyHeaderIndices = hasData ? [0] : undefined;

  function handleClose() {
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={handleClose} title={t('event.findTimeTitle')}>
      <ScrollView
        ref={sheetScrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!isDragging}
        scrollEventThrottle={16}
        stickyHeaderIndices={stickyHeaderIndices}
        onScroll={(event) => {
          scrollY.current = event.nativeEvent.contentOffset.y;
        }}
        onLayout={(event) => setViewportHeight(event.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentHeight(h)}
      >
        {loading && (
          <View style={styles.center}>
            <Spinner size="large" color="primary" />
            <Typography variant="body2" color="secondary" style={styles.marginTop}>
              {t('event.findTimeLoading')}
            </Typography>
          </View>
        )}

        {!loading && error && (
          <View style={styles.center}>
            <Typography variant="body2" color="danger">
              {t('event.findTimeError')}
            </Typography>
            <Typography variant="caption" color="secondary" style={styles.marginTop}>
              {error.message}
            </Typography>
            <Button
              variant="secondary"
              title={t('common.cancel')}
              onPress={refetch}
              style={styles.marginTop}
            />
          </View>
        )}

        {!loading && !error && mergedBusy.length === 0 && availabilities.length === 0 && (
          <View style={styles.center}>
            <Typography variant="body2" color="secondary">
              {t('event.findTimeNoSlots')}
            </Typography>
          </View>
        )}

        {hasData && mergedBusy.length > 0 && searchStart && searchEnd && (
          <View style={[styles.stickyHeader, { backgroundColor: theme.colors.card }]}>
            <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
              {t('event.findTimeTimeline')}
            </Typography>
            <Typography variant="caption" color="secondary" style={styles.timelineTip}>
              {t('event.findTimeTimelineTip')}
            </Typography>
            <View style={styles.modeRow}>
              <Button
                size="small"
                inline
                variant={mode === 'strict' ? 'primary' : 'secondary'}
                title={t('event.findTimeModeStrict')}
                onPress={() => setMode('strict')}
              />
              <Button
                size="small"
                inline
                variant={mode === 'permissive' ? 'primary' : 'secondary'}
                title={t('event.findTimeModePermissive')}
                onPress={() => setMode('permissive')}
              />
            </View>
            <AvailabilityTimelineHeader
              days={days}
              initialStart={currentStart}
              columnWidth={columnWidth}
              headerScrollRef={headerScrollRef}
              onHeaderScroll={onHeaderScroll}
            />
          </View>
        )}

        {hasData && mergedBusy.length > 0 && searchStart && searchEnd && (
          <View>
            <AvailabilityTimelineBody
              mergedBusy={mergedBusy}
              initialStart={currentStart}
              durationMs={durationMs}
              eventTitle={eventTitle ?? ''}
              days={days}
              columnWidth={columnWidth}
              hourRowHeight={hourRowHeight}
              initialColumnIndex={initialColumnIndex}
              attendeeColors={attendeeColorMap}
              attendeeNames={attendeeNameMap}
              gridScrollRef={gridScrollRef}
              onGridScroll={onGridScroll}
              scrollRef={sheetScrollRef}
              scrollY={scrollY}
              viewportHeight={viewportHeight}
              maxScrollY={maxScrollY}
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
              onApplySlot={(slot) => {
                setDraftSlot(slot);
                onApplySlot(slot);
              }}
            />

            <View style={styles.attendeesSection}>
              <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
                {t('event.findTimeAttendees')}
              </Typography>
              <Stack gap={8}>
                {availabilities.map((avail) => (
                  <View
                    key={avail.email}
                    style={[styles.attendeeRow, { borderColor: theme.colors.border }]}
                  >
                    <View style={[styles.colorDot, { backgroundColor: avail.color }]} />
                    <View style={styles.attendeeInfo}>
                      <Typography variant="body2" color="primary">
                        {avail.displayName ?? avail.email}
                      </Typography>
                      {avail.displayName && (
                        <Typography variant="caption" color="secondary">
                          {avail.email}
                        </Typography>
                      )}
                    </View>
                    <View style={styles.pushRight}>
                      <Typography
                        variant="caption"
                        color={avail.available ? 'success' : 'secondary'}
                      >
                        {avail.available
                          ? t('event.findTimeAvailable')
                          : t('event.findTimeUnknown')}
                      </Typography>
                    </View>
                    {mode === 'permissive' && (
                      <View style={styles.toggleWrap}>
                        <Toggle
                          testID={`required-toggle-${avail.email}`}
                          value={!!avail.required}
                          onValueChange={() => toggleRequired(avail.email)}
                        />
                      </View>
                    )}
                    {avail.available && avail.slots.length > 0 && (
                      <View style={styles.busyList}>
                        {avail.slots
                          .filter((s) => s.fbType !== 'FREE')
                          .slice(0, 5)
                          .map((s, j) => (
                            <Typography key={j} variant="caption" color="secondary">
                              {dayjs(s.start).format('LT')} – {dayjs(s.end).format('LT')}
                            </Typography>
                          ))}
                      </View>
                    )}
                  </View>
                ))}
              </Stack>
            </View>
          </View>
        )}

        {hasData && mergedBusy.length === 0 && availabilities.length > 0 && (
          <View style={styles.attendeesSection}>
            <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
              {t('event.findTimeAttendees')}
            </Typography>
            <Stack gap={8}>
              {availabilities.map((avail) => (
                <View
                  key={avail.email}
                  style={[styles.attendeeRow, { borderColor: theme.colors.border }]}
                >
                  <View style={[styles.colorDot, { backgroundColor: avail.color }]} />
                  <View style={styles.attendeeInfo}>
                    <Typography variant="body2" color="primary">
                      {avail.displayName ?? avail.email}
                    </Typography>
                    {avail.displayName && (
                      <Typography variant="caption" color="secondary">
                        {avail.email}
                      </Typography>
                    )}
                  </View>
                  <View style={styles.pushRight}>
                    <Typography
                      variant="caption"
                      color={avail.available ? 'success' : 'secondary'}
                    >
                      {avail.available
                        ? t('event.findTimeAvailable')
                        : t('event.findTimeUnknown')}
                    </Typography>
                  </View>
                </View>
              ))}
            </Stack>
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 600 },
  scrollContent: { paddingHorizontal: 4, paddingBottom: 16 },
  stickyHeader: {
    paddingTop: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  timelineTip: { marginBottom: 8, opacity: 0.7 },
  center: { alignItems: 'center', paddingVertical: 24 },
  marginTop: { marginTop: 8 },
  sectionLabel: { marginBottom: 8 },
  attendeesSection: { marginTop: 16 },
  attendeeRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  attendeeInfo: { flex: 1 },
  pushRight: { marginLeft: 'auto' },
  busyList: { marginTop: 8, gap: 2 },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
    alignSelf: 'center',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  toggleWrap: {
    marginLeft: 8,
    justifyContent: 'center',
  },
});
