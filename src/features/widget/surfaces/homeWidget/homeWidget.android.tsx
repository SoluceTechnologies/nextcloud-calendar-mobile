import React from 'react';
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
  FlexWidget,
  ListWidget,
  TextWidget,
} from 'react-native-android-widget';

import type { AgendaEventItem, AgendaSnapshot, AgendaTimelineEntry, MonthWidgetSnapshot, WidgetSurface } from '../../core/types';
import { type AgendaGroup, agendaGroups, agendaHeader, agendaPalette, compactEvents, emptyLabel } from '../../core/agendaView';
import { onEventColor, widgetPalette, widgetRadius, widgetSpacing, widgetType } from '../../core/theme';
import {
  readAgendaSnapshot,
  readMonthWidgetSnapshot,
  writeAgendaTimeline,
  writeMonthWidgetSnapshot,
} from '../../storage/widgetStore';
import { buildFreshTimeline } from '../../core/buildTimeline';
import { buildMonthWidgetSnapshot } from '../../core/monthSnapshot';
import { useCalendarStore } from '@/stores/calendarStore';

type Palette = ReturnType<typeof widgetPalette>;

const WIDGET_NAMES = ['CalendarSmallWidget', 'CalendarMediumWidget', 'CalendarLargeWidget', 'CalendarMonthWidget'] as const;

function compactLimit(widgetName: string): number {
  return widgetName === 'CalendarSmallWidget' ? 2 : 3;
}

function EventRow({ event }: { event: AgendaEventItem }) {
  const fg = onEventColor(event.color);
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', paddingTop: widgetSpacing.sm }}>
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'column',
          backgroundColor: event.color as `#${string}`,
          borderRadius: widgetRadius.sm,
          padding: 10,
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: event.deepLink }}
      >
        <TextWidget text={event.title} maxLines={1} style={{ fontSize: widgetType.body, fontWeight: '500', color: fg }} />
        <TextWidget text={event.timeLabel} maxLines={1} style={{ fontSize: widgetType.time, color: fg, marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function DayHeaderCell({ group, palette }: { group: AgendaGroup; palette: Palette }) {
  return (
    <FlexWidget style={{ width: 'match_parent', paddingTop: widgetSpacing.sm }}>
      <TextWidget
        text={group.header}
        maxLines={1}
        style={{ fontSize: widgetType.caption, fontWeight: '600', color: group.isToday ? palette.primary : palette.textSecondary }}
      />
    </FlexWidget>
  );
}

function EmptyState({ snapshot, palette }: { snapshot: AgendaSnapshot | null; palette: Palette }) {
  return <TextWidget text={emptyLabel(snapshot)} style={{ fontSize: widgetType.caption, color: palette.textTertiary }} />;
}

function LargeAndroidWidget({ snapshot }: { snapshot: AgendaSnapshot | null }) {
  const palette = agendaPalette(snapshot);
  const groups = agendaGroups(snapshot);

  const cells: React.ReactElement[] = [];
  for (const group of groups) {
    cells.push(<DayHeaderCell key={`h-${group.key}`} group={group} palette={palette} />);
    for (const event of group.items) {
      cells.push(<EventRow key={`${group.key}-${event.uid}-${event.startIso}`} event={event} />);
    }
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.background,
        borderRadius: widgetRadius.lg,
        padding: widgetSpacing.md,
        flexDirection: 'column',
      }}
      clickAction="OPEN_APP"
    >
      {cells.length === 0 ? (
        <EmptyState snapshot={snapshot} palette={palette} />
      ) : (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>{cells}</ListWidget>
      )}
    </FlexWidget>
  );
}

function CompactAndroidWidget({ snapshot, limit }: { snapshot: AgendaSnapshot | null; limit: number }) {
  const palette = agendaPalette(snapshot);
  const header = agendaHeader(snapshot);
  const events = compactEvents(snapshot, limit);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.background,
        borderRadius: widgetRadius.lg,
        padding: widgetSpacing.md,
        flexDirection: 'row',
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget style={{ width: 52, alignItems: 'center' }}>
        <TextWidget text={header.dayLabel} style={{ fontSize: widgetType.caption, fontWeight: '600', color: palette.primary }} />
        <TextWidget text={header.dayNumber} style={{ fontSize: widgetType.heading, fontWeight: '700', color: palette.text }} />
      </FlexWidget>

      <FlexWidget style={{ flex: 1, paddingLeft: widgetSpacing.sm }}>
        {events.length === 0 ? (
          <EmptyState snapshot={snapshot} palette={palette} />
        ) : (
          events.map((event) => <EventRow key={`${event.uid}-${event.startIso}`} event={event} />)
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

function MonthAndroidWidget({ snapshot }: { snapshot: MonthWidgetSnapshot | null }) {
  const settings = useCalendarStore.getState();
  const systemDark = snapshot?.scheme === 'dark';
  const dark = settings.monthWidgetTheme === 'dark' || (settings.monthWidgetTheme === 'system' && systemDark);
  const palette: Record<'background' | 'surface' | 'text' | 'muted' | 'today', `#${string}`> = dark
    ? { background: '#1d1b20', surface: '#28252d', text: '#e9e5eb', muted: '#c9c2cd', today: '#9bcbff' }
    : { background: '#f8f9fb', surface: '#ffffff', text: '#1d1b20', muted: '#62606a', today: '#006fae' };
  const fontWeight = ({ light: '300', normal: '400', medium: '500', bold: '700', black: '900' } as const)[settings.monthWidgetFontWeight];
  const cardStyle = settings.monthWidgetCardStyle;
  const dayUri = (date: string) => settings.monthWidgetDayTap === 'newEvent'
    ? `nextcloud-calendar:///event/new?date=${encodeURIComponent(`${date}T09:00:00`)}`
    : `nextcloud-calendar:///calendar?date=${encodeURIComponent(date)}`;

  if (!snapshot) {
    return (
      <FlexWidget style={{ height: 'match_parent', width: 'match_parent', padding: widgetSpacing.md, backgroundColor: palette.background }}>
        <TextWidget text="Calendar" style={{ fontSize: widgetType.body, color: palette.muted }} />
      </FlexWidget>
    );
  }

  const weekDays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: cardStyle === 'transparent' ? '#00000000' : palette.background,
        borderRadius: cardStyle === 'card' ? widgetRadius.lg : 0,
        padding: widgetSpacing.sm,
      }}
    >
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center', paddingBottom: 4 }}>
        <FlexWidget style={{ flex: 1 }}>
          <TextWidget text={snapshot.monthLabel} style={{ fontSize: widgetType.body, fontWeight, color: palette.text }} />
        </FlexWidget>
        <TextWidget
          text="+"
          style={{ fontSize: widgetType.heading, fontWeight: '400', color: palette.today, paddingHorizontal: 6 }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'nextcloud-calendar:///event/new' }}
        />
      </FlexWidget>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', paddingBottom: 2 }}>
        {weekDays.map((day) => (
          <FlexWidget key={day} style={{ flex: 1, alignItems: 'center' }}>
            <TextWidget text={day} style={{ fontSize: 9, fontWeight: '600', color: palette.muted }} />
          </FlexWidget>
        ))}
      </FlexWidget>
      {Array.from({ length: 6 }, (_, week) => (
        <FlexWidget key={week} style={{ width: 'match_parent', flex: 1, flexDirection: 'row' }}>
          {snapshot.days.slice(week * 7, week * 7 + 7).map((day) => (
            <FlexWidget
              key={day.dateIso}
              style={{
                flex: 1,
                margin: 1,
                padding: 3,
                backgroundColor: day.isToday ? palette.today : cardStyle === 'transparent' ? '#00000000' : palette.surface,
                borderRadius: cardStyle === 'card' ? widgetRadius.sm : 0,
                flexDirection: 'column',
              }}
              clickAction="OPEN_URI"
              clickActionData={{ uri: dayUri(day.dateIso) }}
            >
              <TextWidget
                text={day.dayNumber}
                style={{ fontSize: 12, fontWeight, color: day.isToday ? palette.background : day.inMonth ? palette.text : palette.muted }}
              />
              {day.events.map((event) => (
                <TextWidget
                  key={event.uid}
                  text={event.title}
                  maxLines={1}
                  style={{ fontSize: 9, fontWeight, color: day.isToday ? palette.background : event.color as `#${string}`, marginTop: 1 }}
                />
              ))}
            </FlexWidget>
          ))}
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

function AndroidWidget({
  widgetName, snapshot, monthSnapshot,
}: {
  widgetName: string;
  snapshot: AgendaSnapshot | null;
  monthSnapshot: MonthWidgetSnapshot | null;
}) {
  if (widgetName === 'CalendarMonthWidget') {
    return <MonthAndroidWidget snapshot={monthSnapshot} />;
  }
  if (widgetName === 'CalendarLargeWidget') {
    return <LargeAndroidWidget snapshot={snapshot} />;
  }
  return <CompactAndroidWidget snapshot={snapshot} limit={compactLimit(widgetName)} />;
}

export const widgetTaskHandler = async (props: WidgetTaskHandlerProps) => {
  const cachedSnapshot = readAgendaSnapshot();
  const cachedMonthSnapshot = readMonthWidgetSnapshot();
  props.renderWidget(<AndroidWidget widgetName={props.widgetInfo.widgetName} snapshot={cachedSnapshot} monthSnapshot={cachedMonthSnapshot} />);

  if (props.widgetAction === 'WIDGET_ADDED' || props.widgetAction === 'WIDGET_UPDATE') {
    try {
      const [timeline, monthSnapshot] = await Promise.all([buildFreshTimeline(), buildMonthWidgetSnapshot()]);
      if (timeline && timeline.length > 0) {
        writeAgendaTimeline(timeline);
      }
      writeMonthWidgetSnapshot(monthSnapshot);
      props.renderWidget(
        <AndroidWidget
          widgetName={props.widgetInfo.widgetName}
          snapshot={timeline?.[0]?.snapshot ?? cachedSnapshot}
          monthSnapshot={monthSnapshot}
        />,
      );
    } catch (error) {
      if (__DEV__) console.warn('[widget] handler refresh failed', error);
    }
  }
};

export const homeWidget: WidgetSurface<AgendaTimelineEntry[]> = {
  id: 'homeWidget',
  isSupported: () => true,
  update: async (entries) => {
    if (entries.length === 0) return;
    writeAgendaTimeline(entries);
    const snapshot = entries[0].snapshot;
    const monthSnapshot = await buildMonthWidgetSnapshot();
    writeMonthWidgetSnapshot(monthSnapshot);
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: () => <AndroidWidget widgetName={widgetName} snapshot={snapshot} monthSnapshot={monthSnapshot} />,
        }),
      ),
    );
  },
  clear: async () => {
    writeAgendaTimeline([]);
    writeMonthWidgetSnapshot(null);
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: () => <AndroidWidget widgetName={widgetName} snapshot={null} monthSnapshot={null} />,
        }),
      ),
    );
  },
};

export { registerWidgetTaskHandler };
