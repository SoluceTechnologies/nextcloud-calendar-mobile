import { Appearance } from 'react-native';
import { HStack, Link, RoundedRectangle, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, padding } from '@expo/ui/swift-ui/modifiers';
import type { WidgetEnvironment } from 'expo-widgets';
import { createWidget } from 'expo-widgets';

import type { AgendaEventItem, AgendaSnapshot, AgendaTimelineEntry, WidgetSurface } from '../../core/types';
import { openAppLink } from '../../core/types';

const WIDGET_NAME = 'NextcloudCalendarWidget';

function CalendarWidget(props: { snapshot: AgendaSnapshot | null }, env: WidgetEnvironment) {
  'widget';

  const WIDGET_TYPE = { time: 12, caption: 13, body: 15, title: 17, heading: 22 };
  const WIDGET_SPACING = { xs: 4, sm: 8, md: 12, lg: 16 };
  const LIGHT_PALETTE = {
    background: '#ffffff',
    surface: '#f5f5f5',
    text: '#1a1a1a',
    textSecondary: '#555555',
    textTertiary: '#888888',
    primary: '#109be6',
    onPrimary: '#ffffff',
  };
  const DARK_PALETTE = {
    background: '#121212',
    surface: '#1e1e1e',
    text: '#f1f1f1',
    textSecondary: '#aaaaaa',
    textTertiary: '#666666',
    primary: '#29aef7',
    onPrimary: '#ffffff',
  };
  const AGENDA_EMPTY_LABEL = 'No upcoming event';
  const LARGE_BUDGET = 4;
  const ACCESSORY_FAMILIES = ['accessoryInline', 'accessoryCircular', 'accessoryRectangular'];

  function agendaPalette(snapshot: AgendaSnapshot | null) {
    return (snapshot?.scheme ?? 'light') === 'dark' ? DARK_PALETTE : LIGHT_PALETTE;
  }

  function agendaHeader(snapshot: AgendaSnapshot | null) {
    return { dayLabel: snapshot?.dayLabel ?? '', dayNumber: snapshot?.dayNumber ?? '--' };
  }

  function emptyLabel(snapshot: AgendaSnapshot | null) {
    return snapshot?.relativeLabel || AGENDA_EMPTY_LABEL;
  }

  function compactEvents(snapshot: AgendaSnapshot | null, limit: number) {
    return snapshot?.events.slice(0, limit) ?? [];
  }

  function agendaGroups(snapshot: AgendaSnapshot | null, budget: number) {
    const groups: { key: string; header: string; isToday: boolean; items: AgendaEventItem[] }[] = [];
    let left = budget;
    for (const section of snapshot?.sections ?? []) {
      if (left <= 0) break;
      if (section.items.length === 0) continue;
      const items = section.items.slice(0, left);
      left -= items.length;
      groups.push({ key: section.dayKey, header: `${section.weekdayLong} ${section.dayNumber}`, isToday: section.isToday, items });
    }
    return groups;
  }

  function EventRow({ event }: { event: AgendaEventItem }) {
    return (
      <Link destination={event.deepLink}>
        <HStack alignment="center" modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' })]}>
          <RoundedRectangle cornerRadius={2} modifiers={[foregroundStyle(event.color), frame({ width: 4, height: 30 })]} />
          <VStack alignment="leading" modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), padding({ leading: 8 })]}>
            <Text modifiers={[font({ weight: 'medium', size: WIDGET_TYPE.body }), foregroundStyle(palette.text)]}>{event.title}</Text>
            <Text modifiers={[font({ size: WIDGET_TYPE.time }), foregroundStyle(palette.textSecondary)]}>{event.timeLabel}</Text>
          </VStack>
        </HStack>
      </Link>
    );
  }

  function EmptyState({ snapshot, palette }: { snapshot: AgendaSnapshot | null; palette: typeof LIGHT_PALETTE }) {
    return <Text modifiers={[font({ size: WIDGET_TYPE.caption }), foregroundStyle(palette.textTertiary)]}>{emptyLabel(snapshot)}</Text>;
  }

  function LargeWidget({ snapshot, palette }: { snapshot: AgendaSnapshot | null; palette: typeof LIGHT_PALETTE }) {
    const groups = agendaGroups(snapshot, LARGE_BUDGET);
    const cells = [];
    for (const group of groups) {
      cells.push(
        <Text key={`h-${group.key}`} modifiers={[font({ weight: 'semibold', size: WIDGET_TYPE.caption }), foregroundStyle(group.isToday ? palette.primary : palette.textSecondary)]}>{group.header}</Text>
      );
      for (const event of group.items) {
        cells.push(<EventRow key={`${group.key}-${event.uid}-${event.startIso}`} event={event} />);
      }
    }
    return (
      <VStack alignment="leading" spacing={WIDGET_SPACING.sm} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' }), padding({ all: WIDGET_SPACING.md }), containerBackground(palette.background, 'widget')]}>
        {cells.length === 0 ? (
          <EmptyState snapshot={snapshot} palette={palette} />
        ) : cells}
      </VStack>
    );
  }

  function AccessoryWidget({ snapshot, family }: { snapshot: AgendaSnapshot | null; family: string }) {
    const next = snapshot?.nextEvent ?? null;
    if (!next) {
      return <Text modifiers={[font({ size: WIDGET_TYPE.caption })]}>No event</Text>;
    }
    if (family === 'accessoryInline') {
      return <Text modifiers={[font({ size: WIDGET_TYPE.caption })]}>{`${next.timeLabel} ${next.title}`}</Text>;
    }
    if (family === 'accessoryCircular') {
      return (
        <VStack>
          <Text modifiers={[font({ weight: 'semibold', size: WIDGET_TYPE.time })]}>{next.timeLabel}</Text>
        </VStack>
      );
    }
    return (
      <VStack modifiers={[frame({ maxWidth: Infinity })]}>
        <Text modifiers={[font({ weight: 'semibold', size: WIDGET_TYPE.body })]}>{next.title}</Text>
        <Text modifiers={[font({ size: WIDGET_TYPE.caption })]}>{next.timeLabel}</Text>
      </VStack>
    );
  }

  function SmallWidget({ snapshot, palette }: { snapshot: AgendaSnapshot | null; palette: typeof LIGHT_PALETTE }) {
    const header = agendaHeader(snapshot);
    const events = compactEvents(snapshot, 2);
    const cells = [];
    cells.push(
      <VStack key="hdr" alignment="leading" modifiers={[padding({ bottom: 2 })]}>
        <Text modifiers={[font({ weight: 'semibold', size: WIDGET_TYPE.caption }), foregroundStyle(palette.primary)]}>{header.dayLabel}</Text>
        <Text modifiers={[font({ weight: 'bold', size: WIDGET_TYPE.title }), foregroundStyle(palette.text)]}>{header.dayNumber}</Text>
      </VStack>
    );
    if (events.length === 0) {
      cells.push(<EmptyState key="empty" snapshot={snapshot} palette={palette} />);
    } else {
      for (const event of events) {
        cells.push(<EventRow key={`${event.uid}-${event.startIso}`} event={event} />);
      }
    }
    return (
      <VStack alignment="leading" spacing={WIDGET_SPACING.sm} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' }), padding({ all: WIDGET_SPACING.md }), containerBackground(palette.background, 'widget')]}>
        {cells}
      </VStack>
    );
  }

  function MediumWidget({ snapshot, palette }: { snapshot: AgendaSnapshot | null; palette: typeof LIGHT_PALETTE }) {
    const header = agendaHeader(snapshot);
    const events = compactEvents(snapshot, 3);
    return (
      <HStack alignment="top" modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity }), padding({ all: WIDGET_SPACING.md }), containerBackground(palette.background, 'widget')]}>
        <VStack alignment="leading" modifiers={[frame({ width: 52 })]}>
          <Text modifiers={[font({ weight: 'semibold', size: WIDGET_TYPE.caption }), foregroundStyle(palette.primary)]}>{header.dayLabel}</Text>
          <Text modifiers={[font({ weight: 'bold', size: WIDGET_TYPE.heading }), foregroundStyle(palette.text)]}>{header.dayNumber}</Text>
        </VStack>
        <VStack alignment="leading" spacing={WIDGET_SPACING.sm} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'top' }), padding({ leading: WIDGET_SPACING.sm })]}>
          {events.length === 0 ? (
            <EmptyState snapshot={snapshot} palette={palette} />
          ) : (
            events.map((event) => <EventRow key={`${event.uid}-${event.startIso}`} event={event} />)
          )}
        </VStack>
      </HStack>
    );
  }

  const snapshot = props.snapshot;
  const palette = agendaPalette(snapshot);
  const family = env.widgetFamily;

  if (ACCESSORY_FAMILIES.includes(family)) {
    return <AccessoryWidget snapshot={snapshot} family={family} />;
  }
  if (family === 'systemLarge') {
    return <LargeWidget snapshot={snapshot} palette={palette} />;
  }
  if (family === 'systemSmall') {
    return <SmallWidget snapshot={snapshot} palette={palette} />;
  }
  return <MediumWidget snapshot={snapshot} palette={palette} />;
}

const widget = createWidget<{ snapshot: AgendaSnapshot | null }>(WIDGET_NAME, CalendarWidget);

function emptySnapshot(): AgendaSnapshot {
  return {
    generatedAtIso: new Date().toISOString(),
    timeZone: '',
    scheme: Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
    dayLabel: '',
    dayNumber: '',
    relativeLabel: '',
    events: [],
    sections: [],
  };
}

export const homeWidget: WidgetSurface<AgendaTimelineEntry[]> = {
  id: 'homeWidget',
  isSupported: () => true,
  update: async (entries) => {
    if (entries.length === 0) return;
    widget.updateTimeline(entries.map((e) => ({ date: new Date(e.atIso), props: { snapshot: e.snapshot } })));
  },
  clear: async () => {
    widget.updateTimeline([{ date: new Date(), props: { snapshot: emptySnapshot() } }]);
  },
};

export { openAppLink };
