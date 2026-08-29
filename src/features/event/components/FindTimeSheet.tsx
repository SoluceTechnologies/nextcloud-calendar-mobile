import { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { Sheet, Stack, Typography, Spinner, Button } from '@/ui/components';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import type { Account, Attendee, SuggestedSlot } from '@/types';

dayjs.extend(localizedFormat);

interface Props {
  visible: boolean;
  onClose: () => void;
  account: Account;
  organizer: Attendee;
  attendees: Attendee[];
  start: Date;
  end: Date;
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
  onApplySlot,
}: Props) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [selectedSlot, setSelectedSlot] = useState<SuggestedSlot | null>(null);

  const { loading, error, availabilities, suggestions, refetch } = useFreeBusy({
    account,
    organizer,
    attendees,
    start,
    end,
    enabled: visible,
  });

  function handleApply() {
    if (selectedSlot) {
      onApplySlot(selectedSlot);
      setSelectedSlot(null);
      onClose();
    }
  }

  function handleClose() {
    setSelectedSlot(null);
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={handleClose} title={t('event.findTimeTitle')}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
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

        {!loading && !error && suggestions.length === 0 && (
          <View style={styles.center}>
            <Typography variant="body2" color="secondary">{t('event.findTimeNoSlots')}</Typography>
          </View>
        )}

        {!loading && !error && suggestions.length > 0 && (
          <Stack gap={16}>
            <View>
              <Typography variant="body2" color="secondary" style={styles.sectionLabel}>
                {t('event.findTimeSuggested')}
              </Typography>
              <View style={styles.slotsContainer}>
                {suggestions.map((slot, i) => {
                  const isSelected = selectedSlot?.start.getTime() === slot.start.getTime();
                  return (
                    <Pressable
                      key={i}
                      onPress={() => setSelectedSlot(slot)}
                      style={[
                        styles.slotChip,
                        {
                          borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                          backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                        },
                      ]}
                    >
                      <Typography
                        variant="caption"
                        color={isSelected ? 'onPrimary' : 'primary'}
                      >
                        {dayjs(slot.start).format('ddd ll LT')}
                      </Typography>
                    </Pressable>
                  );
                })}
              </View>
            </View>

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
                    <Stack direction="horizontal" vAlign="center" gap={8}>
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
                    </Stack>
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

      {selectedSlot && (
        <Button
          variant="primary"
          title={t('event.findTimeApply')}
          onPress={handleApply}
          style={styles.applyButton}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 400 },
  scrollContent: { paddingHorizontal: 4, paddingBottom: 16 },
  center: { alignItems: 'center', paddingVertical: 24 },
  marginTop: { marginTop: 8 },
  sectionLabel: { marginBottom: 8 },
  slotsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  attendeeRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
  },
  attendeeInfo: { flex: 1 },
  pushRight: { marginLeft: 'auto' },
  busyList: { marginTop: 8, gap: 2 },
  applyButton: { marginTop: 8 },
});
