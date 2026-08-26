import React from 'react';
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
  FlexWidget,
  ListWidget,
  TextWidget,
} from 'react-native-android-widget';

import type { AgendaEventItem, AgendaSnapshot, AgendaTimelineEntry, WidgetSurface } from '../../core/types';
import { type AgendaGroup, agendaGroups, agendaHeader, agendaPalette, compactEvents, emptyLabel } from '../../core/agendaView';
import { onEventColor, widgetPalette, widgetRadius, widgetSpacing, widgetType } from '../../core/theme';
import { readAgendaSnapshot, writeAgendaTimeline } from '../../storage/widgetStore';
import { buildFreshTimeline } from '../../core/buildTimeline';

type Palette = ReturnType<typeof widgetPalette>;

const WIDGET_NAMES = ['CalendarSmallWidget', 'CalendarMediumWidget', 'CalendarLargeWidget'] as const;

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

function AndroidWidget({ widgetName, snapshot }: { widgetName: string; snapshot: AgendaSnapshot | null }) {
  if (widgetName === 'CalendarLargeWidget') {
    return <LargeAndroidWidget snapshot={snapshot} />;
  }
  return <CompactAndroidWidget snapshot={snapshot} limit={compactLimit(widgetName)} />;
}

export const widgetTaskHandler = async (props: WidgetTaskHandlerProps) => {
  // Render immediately with the last cached snapshot so the widget is never blank.
  const cachedSnapshot = readAgendaSnapshot();
  props.renderWidget(<AndroidWidget widgetName={props.widgetInfo.widgetName} snapshot={cachedSnapshot} />);

  // When Android triggers a periodic update (every `updatePeriodMillis`) or the
  // widget is first placed on the home screen, refresh from the local
  // WatermelonDB so the widget shows current events even when the app is not
  // open.  We use `props.renderWidget` (not `requestWidgetUpdate`) to avoid an
  // infinite update loop.
  if (props.widgetAction === 'WIDGET_ADDED' || props.widgetAction === 'WIDGET_UPDATE') {
    try {
      const timeline = await buildFreshTimeline();
      if (timeline && timeline.length > 0) {
        writeAgendaTimeline(timeline);
        const snapshot = timeline[0].snapshot;
        props.renderWidget(<AndroidWidget widgetName={props.widgetInfo.widgetName} snapshot={snapshot} />);
      }
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
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: () => <AndroidWidget widgetName={widgetName} snapshot={snapshot} />,
        }),
      ),
    );
  },
  clear: async () => {
    writeAgendaTimeline([]);
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({ widgetName, renderWidget: () => <AndroidWidget widgetName={widgetName} snapshot={null} /> }),
      ),
    );
  },
};

export { registerWidgetTaskHandler };
