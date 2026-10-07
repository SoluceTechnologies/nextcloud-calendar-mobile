import type { ReactNode } from 'react';
import { jsx, jsxs } from 'react/jsx-runtime';
import type { AgendaDaySection, AgendaEventItem, AgendaSnapshot, AgendaTimelineEntry } from '@/features/widget/core/types';

jest.mock('@expo/ui/swift-ui', () => ({ HStack: 'HStack', Link: 'Link', Text: 'Text', VStack: 'VStack' }));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  background: jest.fn(),
  containerBackground: jest.fn(),
  cornerRadius: jest.fn(),
  font: jest.fn(),
  foregroundStyle: jest.fn(),
  frame: jest.fn(),
  lineLimit: jest.fn(),
  padding: jest.fn(),
}));
jest.mock('@/features/widget/storage/widgetStore', () => ({ writeAgendaTimeline: jest.fn() }));

const mockUpdateSnapshot = jest.fn();
const mockUpdateTimeline = jest.fn();
let mockWidgetSource: string | null = null;

jest.mock('expo-widgets', () => ({
  createWidget: (_name: string, render: string) => {
    mockWidgetSource = render;
    return { updateSnapshot: mockUpdateSnapshot, updateTimeline: mockUpdateTimeline };
  },
}));

function entry(atIso: string, snapshot: AgendaSnapshot): AgendaTimelineEntry {
  return { atIso, snapshot };
}

function makeSnapshot(): AgendaSnapshot {
  return {
    generatedAtIso: '2026-07-29T09:00:00.000Z',
    timeZone: 'Europe/Berlin',
    scheme: 'light',
    dayLabel: 'WED',
    dayNumber: '29',
    relativeLabel: 'Wednesday, 29 July',
    events: [],
    sections: [],
  };
}

describe('homeWidget (ios)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockUpdateSnapshot.mockReset();
    mockUpdateTimeline.mockReset();
  });

  it('schedules every entry so WidgetKit advances without the app', async () => {
    const { homeWidget } = require('@/features/widget/surfaces/homeWidget/homeWidget.ios');
    const snapshot = makeSnapshot();
    await homeWidget.update([
      entry('2026-07-29T09:00:00.000Z', snapshot),
      entry('2026-07-29T10:30:00.000Z', snapshot),
    ]);

    expect(mockUpdateTimeline).toHaveBeenCalledTimes(1);
    const scheduled = mockUpdateTimeline.mock.calls[0][0];
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0]).toEqual({ date: new Date('2026-07-29T09:00:00.000Z'), props: { snapshot } });
    expect(scheduled[1].date).toEqual(new Date('2026-07-29T10:30:00.000Z'));
  });

  it('leaves the current timeline alone when there is nothing to schedule', async () => {
    const { homeWidget } = require('@/features/widget/surfaces/homeWidget/homeWidget.ios');
    await homeWidget.update([]);

    expect(mockUpdateTimeline).not.toHaveBeenCalled();
  });

  it('clears the widget with an empty (non-null) snapshot timeline', async () => {
    // Pushing a null snapshot crashes the native render, so clearing replaces
    // the timeline with a single event-less snapshot the widget can render.
    const { homeWidget } = require('@/features/widget/surfaces/homeWidget/homeWidget.ios');
    await homeWidget.clear();

    expect(mockUpdateTimeline).toHaveBeenCalledTimes(1);
    const scheduled = mockUpdateTimeline.mock.calls[0][0];
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].props.snapshot).not.toBeNull();
    expect(scheduled[0].props.snapshot.events).toEqual([]);
    expect(scheduled[0].props.snapshot.sections).toEqual([]);
  });
});

function makeItem(uid: string): AgendaEventItem {
  return {
    uid,
    title: `Event ${uid}`,
    startIso: '2026-07-29T10:00:00.000Z',
    endIso: '2026-07-29T11:00:00.000Z',
    allDay: false,
    color: '#3b82f6',
    timeLabel: '10:00 – 11:00',
    deepLink: `nextcloud-calendar://event/${uid}`,
  };
}

function makeSection(dayKey: string, count: number, isToday = false): AgendaDaySection {
  return {
    dayKey,
    dayLabel: 'WED',
    dayNumber: '29',
    weekdayLong: 'Wednesday',
    isToday,
    items: Array.from({ length: count }, (_, i) => makeItem(`${dayKey}-${i}`)),
  };
}

interface RenderedRows { events: number; headers: number }

function countRenderedRows(node: ReactNode, acc: RenderedRows = { events: 0, headers: 0 }): RenderedRows {
  for (const el of Array.isArray(node) ? node : [node]) {
    if (!el || typeof el !== 'object' || !('props' in el)) continue;
    const { type, key, props } = el as {
      type?: unknown; key?: string | null; props: Record<string, unknown> & { children?: ReactNode };
    };
    if (typeof type === 'function') {
      if (props.event) acc.events += 1;
      countRenderedRows((type as (p: unknown) => ReactNode)(props), acc);
      continue;
    }
    if (typeof key === 'string' && key.startsWith('h-')) acc.headers += 1;
    countRenderedRows(props.children, acc);
  }
  return acc;
}

describe('homeWidget (ios) large widget budget', () => {
  beforeEach(() => {
    jest.resetModules();
    mockWidgetSource = null;
  });

  // The 'widget' pragma makes babel serialize CalendarWidget to a source
  // string; eval it with stubbed bindings to exercise the shipped logic.
  function renderLarge(snapshot: AgendaSnapshot): RenderedRows {
    require('@/features/widget/surfaces/homeWidget/homeWidget.ios');
    const render = new Function(
      '_jsx', '_jsxs',
      'Link', 'HStack', 'RoundedRectangle', 'VStack', 'Text',
      'containerBackground', 'font', 'foregroundStyle', 'frame', 'lineLimit', 'padding',
      `return (${mockWidgetSource});`,
    )(
      jsx, jsxs,
      'Link', 'HStack', 'RoundedRectangle', 'VStack', 'Text',
      jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(), jest.fn(),
    ) as (props: { snapshot: AgendaSnapshot | null }, env: { widgetFamily: string }) => ReactNode;
    return countRenderedRows(render({ snapshot }, { widgetFamily: 'systemLarge' }));
  }

  it('shows more than the old 4-item cap when several days have events', () => {
    const snapshot = makeSnapshot();
    snapshot.sections = [makeSection('2026-07-29', 3, true), makeSection('2026-07-30', 5)];
    const { events, headers } = renderLarge(snapshot);

    // 8-row budget: header+3 (today) + header+3 (tomorrow, truncated to fit)
    expect(headers).toBe(2);
    expect(events).toBe(6);
  });

  it('drops a whole day section when no row remains for its items', () => {
    const snapshot = makeSnapshot();
    snapshot.sections = [makeSection('2026-07-29', 10, true), makeSection('2026-07-30', 5)];
    const { events, headers } = renderLarge(snapshot);

    // today fills the 8 rows (1 header + 7 items), leaving no room for tomorrow
    expect(headers).toBe(1);
    expect(events).toBe(7);
    expect(events + headers).toBe(8);
  });

  it('never exceeds the row budget', () => {
    const snapshot = makeSnapshot();
    snapshot.sections = [
      makeSection('2026-07-29', 2, true),
      makeSection('2026-07-30', 2),
      makeSection('2026-07-31', 2),
      makeSection('2026-08-01', 2),
      makeSection('2026-08-02', 2),
    ];
    const { events, headers } = renderLarge(snapshot);

    expect(events + headers).toBeLessThanOrEqual(8);
  });
});