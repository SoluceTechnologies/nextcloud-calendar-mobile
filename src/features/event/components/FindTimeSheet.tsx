import { useState, useMemo } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { Sheet, Stack, Typography, Spinner, Button } from '@/ui/components';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import { AvailabilityTimeline } from '@/features/event/components/AvailabilityTimeline';
import type { Account, Attendee, SuggestedSlot } from '@/types';

dayjs.extend(localizedFormat);

const HOUR_RAIL_WIDTH = 56;

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

  const currentStart = draftSlot?.start ?? start;
  const currentEnd = draftSlot?.end ?? end;

  const { loading, error, availabilities, refetch, mergedBusy, searchStart, searchEnd } = useFreeBusy({
    account,
    organizer,
    attendees,
    start: currentStart,
    end: currentEnd,
    enabled: visible,
  });

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

  function handleClose() {
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={handleClose} title={t('event.findTimeTitle')}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
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
              <Typography variant="body2" color="danger">{t('event.findTimeError')}</Typography>
              <Typography variant="caption" color="secondary" style={styles.marginTop}>
                {error.message}
              </Typography>
              <Button variant="secondary" title={t('common.cancel')} onPress={refetch} style={styles.marginTop} />
            </View>
          )}

          {!loading && !error && mergedBusy.length === 0 && availabilities.length === 0 && (
            <View style={styles.center}>
              <Typography variant="body2" color="secondary">{t('event.findTimeNoSlots')}</Typography>
            </View>
          )}

          {!loading && !error && (mergedBusy.length > 0 || availabilities.length > 0) && (
            <Stack gap={16}>
              {mergedBusy.length > 0 && searchStart && searchEnd && (
                <View>
                  <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
                    {t('event.findTimeTimeline')}
                  </Typography>
                  <AvailabilityTimeline
                    mergedBusy={mergedBusy}
                    searchStart={searchStart}
                    searchEnd={searchEnd}
                    initialStart={currentStart}
                    durationMs={durationMs}
                    eventTitle={eventTitle ?? ''}
                    days={days}
                    columnWidth={columnWidth}
                    hourRowHeight={hourRowHeight}
                    onApplySlot={(slot) => {
                      setDraftSlot(slot);
                      onApplySlot(slot);
                    }}
                  />
                </View>
              )}

              <View>
                <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
                  {t('event.findTimeAttendees')}
                </Typography>
                <Stack gap={8}>
                  {availabilities.map((avail) => (
                    <View
                      key={avail.email}
                      style={[styles.attendeeRow, { borderColor: theme.colors.border }]}
                    >
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
            </Stack>
          )}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 600 },
  scrollContent: { paddingHorizontal: 4, paddingBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 },
  marginTop: { marginTop: 8 },
  sectionLabel: { marginBottom: 8 },
  attendeeRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  attendeeInfo: { flex: 1 },
  pushRight: { marginLeft: 'auto' },
  busyList: { marginTop: 8, gap: 2 },
});
