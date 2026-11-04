import { StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { Repeat } from 'lucide-react-native';

import { useTimeFormat } from '@/hooks/useTimeFormat';
import type { CalendarEvent } from '@/types';
import { Item, List, SectionHeader, Spinner, Stack, Typography } from '@/ui/components';

import type { SearchableEvent } from '../matchEvent';
import { hrefPath, type ServerHit } from '../serverSearch';
import { MAX_RESULTS, type LocalSearchResult } from '../useLocalSearch';

dayjs.extend(localizedFormat);

export type ServerResults = { hits: ServerHit[]; loading: boolean; failed: boolean };

export interface SearchResultsProps {
  local: LocalSearchResult;
  server: ServerResults;
  offline: boolean;
  openingHref: string | null;
  onOpenEvent: (event: CalendarEvent) => void;
  onOpenServerHit: (hit: ServerHit) => void;
}

function ColorBar({ color }: { color: string }) {
  return <View style={[styles.colorBar, { backgroundColor: color }]} />;
}

function EventSection({
  title,
  items,
  total,
  onOpenEvent,
}: {
  title: string;
  items: SearchableEvent[];
  total: number;
  onOpenEvent: (event: CalendarEvent) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const { formatTime } = useTimeFormat();
  if (items.length === 0) return null;

  const describe = (event: CalendarEvent) => {
    const time = event.allDay
      ? t('calendar.allDay')
      : `${formatTime(event.dtstart)} – ${formatTime(event.dtend)}`;
    const when = `${dayjs(event.dtstart).format('ll')} · ${time}`;
    return event.location ? `${when} · ${event.location}` : when;
  };

  return (
    <Stack hAlign="stretch" style={styles.section}>
      <SectionHeader title={title} />
      <List>
        {items.map(({ event }) => (
          <Item
            key={`${event.calendarId}-${event.uid}`}
            testID={`result-event-${event.uid}`}
            leading={<ColorBar color={event.color} />}
            title={event.summary || t('calendar.noTitle')}
            description={describe(event)}
            trailing={event.isRecurring ? <Repeat size={16} color={colors.textTertiary} /> : undefined}
            onPress={() => onOpenEvent(event)}
          />
        ))}
      </List>
      {total > items.length ? (
        <Typography variant="caption" color="secondary" style={styles.note}>
          {t('search.truncated', { count: MAX_RESULTS })}
        </Typography>
      ) : null}
    </Stack>
  );
}

export function SearchResults({ local, server, offline, openingHref, onOpenEvent, onOpenServerHit }: SearchResultsProps) {
  const { t } = useTranslation();
  const nothing = local.upcoming.length === 0 && local.past.length === 0 && server.hits.length === 0;

  return (
    <>
      {offline ? (
        <Typography variant="caption" color="secondary" style={styles.note}>
          {t('search.offlineNote')}
        </Typography>
      ) : null}
      {server.failed ? (
        <Typography variant="caption" color="danger" style={styles.note}>
          {t('search.serverFailed')}
        </Typography>
      ) : null}

      <EventSection
        title={t('search.upcoming')}
        items={local.upcoming}
        total={local.upcomingTotal}
        onOpenEvent={onOpenEvent}
      />
      <EventSection title={t('search.past')} items={local.past} total={local.pastTotal} onOpenEvent={onOpenEvent} />

      {server.hits.length > 0 ? (
        <Stack hAlign="stretch" style={styles.section}>
          <SectionHeader title={t('search.fromServer')} />
          <List>
            {server.hits.map((hit) => (
              <Item
                key={hit.href}
                testID={`result-server-${hrefPath(hit.href)}`}
                leading={<ColorBar color={hit.calendar.color} />}
                title={hit.title || t('calendar.noTitle')}
                description={hit.subline}
                trailing={openingHref === hit.href ? <Spinner size="small" /> : undefined}
                disabled={openingHref !== null}
                onPress={() => onOpenServerHit(hit)}
              />
            ))}
          </List>
        </Stack>
      ) : null}

      {nothing && !server.loading ? (
        <Stack hAlign="stretch" style={styles.section} testID="search-empty">
          <Typography variant="body1" align="center">{t('search.noResults')}</Typography>
          <Typography variant="caption" color="secondary" align="center">{t('search.noResultsHint')}</Typography>
        </Stack>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  note: { paddingHorizontal: 2, marginTop: 8 },
  colorBar: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
