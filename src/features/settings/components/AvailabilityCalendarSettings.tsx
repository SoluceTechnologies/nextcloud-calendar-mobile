import { useTranslation } from 'react-i18next';

import { useAccountStore } from '@/stores/accountStore';
import { useActiveAccount } from '@/hooks/useAccounts';
import { useCalendars } from '@/hooks/useCalendars';
import { useCalendarStore } from '@/stores/calendarStore';
import { Divider, Stack, Toggle, Typography } from '@/ui/components';

const cardOuter = { marginHorizontal: 16, marginBottom: 12 };

/** Per-calendar "counts for availability" flag — default: writable counts, read-only doesn't. */
export function AvailabilityCalendarSettings() {
    const { t } = useTranslation();
    const activeAccountId = useAccountStore((s) => s.activeAccountId);
    const activeAccount = useActiveAccount(activeAccountId);
    const { data: calendars = [] } = useCalendars(activeAccount);
    const overrides = useCalendarStore((s) => s.availabilityCalendarOverrides);
    const setAvailability = useCalendarStore((s) => s.setCalendarAvailability);

    return (
        <Stack card gap={12} padding={16} hAlign="stretch" style={cardOuter}>
            <Stack gap={2}>
                <Typography variant="body1">{t('settings.voice.availabilityTitle')}</Typography>
                <Typography variant="caption" color="secondary">
                    {t('settings.voice.availabilityHint')}
                </Typography>
            </Stack>

            {calendars.length === 0 ? (
                <Typography variant="caption" color="secondary">
                    {t('calendar.drawerNoCalendars')}
                </Typography>
            ) : (
                calendars.map((cal, i) => {
                    const on = overrides[cal.id] ?? !cal.isReadOnly;
                    return (
                        <Stack key={cal.id} gap={12} hAlign="stretch">
                            {i > 0 && <Divider />}
                            <Stack direction="horizontal" vAlign="center" gap={12}>
                                <Stack gap={2} style={{ flex: 1 }}>
                                    <Typography variant="body1" numberOfLines={1}>{cal.displayName}</Typography>
                                    {cal.isReadOnly && (
                                        <Typography variant="caption" color="secondary">
                                            {t('voice.calendarReadOnly')}
                                        </Typography>
                                    )}
                                </Stack>
                                <Toggle
                                    value={on}
                                    onValueChange={(v) => setAvailability(cal.id, v)}
                                    accessibilityLabel={cal.displayName}
                                    testID={`availability-${cal.id}`}
                                />
                            </Stack>
                        </Stack>
                    );
                })
            )}
        </Stack>
    );
}
