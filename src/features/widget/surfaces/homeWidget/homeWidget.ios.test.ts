import type { AgendaSnapshot, AgendaTimelineEntry } from '@/features/widget/core/types';

jest.mock('@expo/ui/swift-ui', () => ({ HStack: 'HStack', Link: 'Link', Text: 'Text', VStack: 'VStack' }));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  background: jest.fn(),
  cornerRadius: jest.fn(),
  font: jest.fn(),
  foregroundStyle: jest.fn(),
  frame: jest.fn(),
  padding: jest.fn(),
}));
jest.mock('@/features/widget/storage/widgetStore', () => ({ writeAgendaTimeline: jest.fn() }));

const mockUpdateSnapshot = jest.fn();
const mockUpdateTimeline = jest.fn();

jest.mock('expo-widgets', () => ({
  createWidget: () => ({ updateSnapshot: mockUpdateSnapshot, updateTimeline: mockUpdateTimeline }),
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