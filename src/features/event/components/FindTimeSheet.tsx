import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import type { Account, Attendee, CalendarMeta, CalendarEvent } from '@/types';
import { eventsOnDay, busyCalendarIds, findFreeSlots, type FreeSlot } from '@/services/voice/actions';
import { fetchFreeBusy } from '@/services/nextcloud/freeBusy';
import { mergeBusySlots } from '@/utils/freeBusy';
import { resolveOrganizer } from '@/features/event/utils/organizer';
import { useCalendarStore } from '@/stores/calendarStore';
import { useTimeFormat } from '@/hooks/useTimeFormat';
import { Button, Sheet, Spinner, Stack, Typography } from '@/ui/components';

interface Props {
    visible: boolean;
    onClose: () => void;
    account: Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'> & Partial<Account>;
    calendars: CalendarMeta[];
    day: Date;
    durationMin: number;
    attendees: Attendee[];
    onPick: (slot: FreeSlot) => void;
}

/** Manual counterpart of the voice "find a slot" intent — identical rules:
 * blocking-flagged own calendars + attendee free/busy (RFC 6638 outbox). */
export function FindTimeSheet({ visible, onClose, account, calendars, day, durationMin, attendees, onPick }: Props) {
    const { t } = useTranslation();
    const { formatTime } = useTimeFormat();
    const [slots, setSlots] = useState<FreeSlot[] | null>(null);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async () => {
        setSlots(null);
        setFailed(false);
        try {
            const events = await eventsOnDay(account.id, day);
            const busyIds = busyCalendarIds(calendars, useCalendarStore.getState().availabilityCalendarOverrides);
            const busyEvents = events.filter((e) => busyIds.has(e.calendarId));
            if (attendees.length && account.davUserId) {
                try {
                    const { organizerEmail, organizerName } = resolveOrganizer(account as Account);
                    const avail = await fetchFreeBusy(
                        account as Account,
                        { email: organizerEmail, displayName: organizerName },
                        attendees,
                        dayjs(day).startOf('day').toDate(),
                        dayjs(day).endOf('day').toDate(),
                    );
                    for (const b of mergeBusySlots(avail)) {
                        busyEvents.push({ dtstart: b.start, dtend: b.end, allDay: false, isTask: false, calendarId: '__freebusy__' } as CalendarEvent);
                    }
                } catch { /* offline → own calendars only */ }
            }
            const now = new Date();
            setSlots(findFreeSlots(busyEvents, day, {
                durationMin,
                minStart: dayjs(day).isSame(now, 'day') ? now : undefined,
            }));
        } catch {
            setFailed(true);
        }
    }, [account, calendars, day, durationMin, attendees]);

    useEffect(() => { if (visible) void load(); }, [visible, load]);

    return (
        <Sheet visible={visible} onClose={onClose} title={t('event.findTimeTitle')}>
            <Stack gap={12} padding={16} hAlign="stretch">
                {slots === null && !failed && (
                    <Stack direction="horizontal" gap={8} vAlign="center">
                        <Spinner />
                        <Typography variant="body2" color="secondary">{t('event.findTimeLoading')}</Typography>
                    </Stack>
                )}
                {failed && <Typography variant="body2" color="danger">{t('event.findTimeError')}</Typography>}
                {slots !== null && slots.length === 0 && !failed && (
                    <Typography variant="body2" color="secondary">{t('event.findTimeNone')}</Typography>
                )}
                {slots?.map((s, i) => (
                    <Button
                        key={i}
                        testID={`find-time-slot-${i}`}
                        title={`${formatTime(s.start)} – ${formatTime(s.end)}`}
                        onPress={() => { onPick(s); onClose(); }}
                    />
                ))}
            </Stack>
        </Sheet>
    );
}
