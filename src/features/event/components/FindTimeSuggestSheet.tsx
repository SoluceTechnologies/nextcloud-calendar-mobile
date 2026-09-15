import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { CalendarSearch } from 'lucide-react-native';
import {
  AnimatedPressable, Sheet, Stack, Typography, Spinner, Button, Toggle, Chip,
} from '@/ui/components';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import { useFindTimeStore } from '@/features/event/stores/findTimeStore';
import { isSlotFree } from '@/utils/freeBusy';
import type { Account, Attendee, SuggestedSlot } from '@/types';

dayjs.extend(localizedFormat);

const MAX_SUGGESTIONS = 8;

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

export function FindTimeSuggestSheet({
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
  const router = useRouter();

  const [everyoneFree, setEveryoneFree] = useState(true);
  const [requiredAttendees, setRequiredAttendees] = useState<string[]>(() =>
    attendees.map((a) => a.email.toLowerCase()),
  );

  const attendeeKey = useMemo(
    () => attendees.map((a) => a.email.toLowerCase()).join(','),
    [attendees],
  );

  useEffect(() => {
    setRequiredAttendees(attendees.map((a) => a.email.toLowerCase()));
  }, [attendeeKey]);

  const { loading, error, availabilities, suggestions, refetch } = useFreeBusy({
    account,
    organizer,
    attendees,
    start,
    end,
    enabled: visible,
    mode: everyoneFree ? 'strict' : 'permissive',
    requiredAttendees,
  });

  const upcomingSuggestions = useMemo(
    () => suggestions.filter((s) => s.end.getTime() > Date.now()).slice(0, MAX_SUGGESTIONS),
    [suggestions],
  );

  const busyNamesFor = (slot: SuggestedSlot): string[] =>
    availabilities
      .filter(
        (a) =>
          a.available &&
          !isSlotFree(
            slot,
            a.slots.filter((s) => s.fbType !== 'FREE'),
          ),
      )
      .map((a) => a.displayName ?? a.email.split('@')[0]);

  const isCurrentSlot = (slot: SuggestedSlot) =>
    slot.start.getTime() === start.getTime() && slot.end.getTime() === end.getTime();

  const toggleRequired = (email: string) => {
    const emailLower = email.toLowerCase();
    setRequiredAttendees((prev) =>
      prev.includes(emailLower)
        ? prev.filter((e) => e !== emailLower)
        : [...prev, emailLower],
    );
  };

  function handlePick(slot: SuggestedSlot) {
    onApplySlot(slot);
    onClose();
  }

  function handleExplore() {
    useFindTimeStore.getState().setRequest({
      account,
      organizer,
      attendees,
      start,
      end,
      eventTitle: eventTitle ?? '',
      mode: everyoneFree ? 'strict' : 'permissive',
      requiredAttendees,
    });
    // The Sheet is an RN Modal: it must unmount before the route is pushed,
    // otherwise the pushed screen renders underneath the modal on Android.
    onClose();
    router.push('/event/find-time');
  }

  const hasData = !loading && !error && availabilities.length > 0;

  return (
    <Sheet visible={visible} onClose={onClose} title={t('event.findTimeTitle')}>
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
            title={t('event.findTimeRetry')}
            onPress={refetch}
            style={styles.marginTop}
          />
        </View>
      )}

      {!loading && !error && (
        <>
          <View style={styles.modeRow}>
            <Typography variant="body2" color="secondary" style={styles.flex}>
              {t('event.findTimeEveryoneMustBeFree')}
            </Typography>
            <Toggle
              testID="find-time-everyone-free"
              value={everyoneFree}
              onValueChange={setEveryoneFree}
            />
          </View>

          {hasData && upcomingSuggestions.length > 0 ? (
            <ScrollView style={styles.suggestions} nestedScrollEnabled>
              <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
                {t('event.findTimeSuggested')}
              </Typography>
              <Stack gap={4}>
                {upcomingSuggestions.map((slot, i) => {
                  const busyNames = busyNamesFor(slot);
                  const current = isCurrentSlot(slot);
                  return (
                    <AnimatedPressable
                      key={i}
                      testID={`suggestion-${i}`}
                      onPress={() => handlePick(slot)}
                      style={[
                        styles.suggestionRow,
                        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
                      ]}
                    >
                      <Typography variant="body2" weight="600">
                        {dayjs(slot.start).format('ddd ll')} · {dayjs(slot.start).format('LT')} –{' '}
                        {dayjs(slot.end).format('LT')}
                        {current ? ` · ${t('event.findTimeCurrent')}` : ''}
                      </Typography>
                      <Typography
                        variant="caption"
                        color={busyNames.length === 0 ? 'primary' : 'secondary'}
                      >
                        {busyNames.length === 0
                          ? t('event.findTimeSlotAllFree')
                          : t('event.findTimeSlotBusyNames', { names: busyNames.join(', ') })}
                      </Typography>
                    </AnimatedPressable>
                  );
                })}
              </Stack>
            </ScrollView>
          ) : (
            !loading &&
            !error && (
              <Typography variant="body2" color="secondary" style={styles.center}>
                {t('event.findTimeNoSlots')}
              </Typography>
            )
          )}

          {hasData && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipsRow}
              >
                {availabilities.map((a) => {
                  const required =
                    everyoneFree || requiredAttendees.includes(a.email.toLowerCase());
                  return (
                    <Chip
                      key={a.email}
                      small
                      rounded
                      active={required}
                      activeColor={a.available ? a.color : theme.colors.border}
                      disabled={everyoneFree}
                      onPress={() => toggleRequired(a.email)}
                      icon={
                        <View
                          style={[
                            styles.dot,
                            { backgroundColor: a.available ? a.color : theme.colors.border },
                          ]}
                        />
                      }
                    >
                      {a.displayName ?? a.email.split('@')[0]}
                    </Chip>
                  );
                })}
              </ScrollView>
              {availabilities.some((a) => !a.available) && (
                <Typography variant="caption" color="secondary">
                  {t('event.findTimeSomeUnknown')}
                </Typography>
              )}

              <Button
                variant="secondary"
                title={t('event.findTimeExplore')}
                icon={<CalendarSearch size={18} color={theme.colors.primary} />}
                onPress={handleExplore}
                testID="find-time-explore"
              />
            </>
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  center: { alignItems: 'center', paddingVertical: 24 },
  marginTop: { marginTop: 8 },
  sectionLabel: { marginBottom: 4 },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  suggestions: {
    maxHeight: 300,
  },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 10,
    gap: 2,
  },
  chipsRow: {
    gap: 8,
    paddingVertical: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
