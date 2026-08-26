import type { AgendaSnapshot, AgendaTimelineEntry } from '@/features/widget/core/types';

jest.mock('react-native-android-widget', () => ({
  registerWidgetTaskHandler: jest.fn(),
  requestWidgetUpdate: jest.fn(),
  FlexWidget: 'FlexWidget',
  ListWidget: 'ListWidget',
  TextWidget: 'TextWidget',
}));

jest.mock('@/features/widget/storage/widgetStore', () => ({
  readAgendaSnapshot: jest.fn((): AgendaSnapshot | null => null),
  writeAgendaTimeline: jest.fn(),
}));

const mockBuildFreshTimeline = jest.fn();

jest.mock('@/features/widget/core/buildTimeline', () => ({
  buildFreshTimeline: (...args: unknown[]) => mockBuildFreshTimeline(...args),
  AGENDA_DAYS: 7,
}));

function makeSnapshot(dayNumber: string): AgendaSnapshot {
  return {
    generatedAtIso: '2026-08-26T09:00:00.000Z',
    timeZone: 'Europe/Berlin',
    scheme: 'light',
    dayLabel: 'WED',
    dayNumber,
    relativeLabel: 'Wednesday, 26 August',
    events: [],
    sections: [],
  };
}

function makeTimeline(dayNumber: string): AgendaTimelineEntry[] {
  return [{ atIso: '2026-08-26T09:00:00.000Z', snapshot: makeSnapshot(dayNumber) }];
}

function handlerProps(action: 'WIDGET_ADDED' | 'WIDGET_UPDATE' | 'WIDGET_CLICK') {
  const renderWidget = jest.fn();
  return {
    widgetInfo: { widgetName: 'CalendarSmallWidget', widgetId: 1, height: 110, width: 110, screenInfo: { screenHeightDp: 800, screenWidthDp: 400, density: 2, densityDpi: 320 } },
    widgetAction: action,
    renderWidget,
  };
}

describe('widgetTaskHandler (android)', () => {
  beforeEach(() => {
    jest.resetModules();
    mockBuildFreshTimeline.mockReset();
    const store = require('@/features/widget/storage/widgetStore');
    store.readAgendaSnapshot.mockReset();
    store.writeAgendaTimeline.mockReset();
  });

  it('refreshes from the local DB on WIDGET_UPDATE and renders the fresh snapshot', async () => {
    const store = require('@/features/widget/storage/widgetStore');
    store.readAgendaSnapshot.mockReturnValue(makeSnapshot('25'));
    mockBuildFreshTimeline.mockResolvedValue(makeTimeline('26'));

    const { widgetTaskHandler } = require('@/features/widget/surfaces/homeWidget/homeWidget.android');
    const props = handlerProps('WIDGET_UPDATE');
    await widgetTaskHandler(props);

    expect(mockBuildFreshTimeline).toHaveBeenCalledTimes(1);
    expect(store.writeAgendaTimeline).toHaveBeenCalledWith(makeTimeline('26'));
    // First render uses the cached snapshot, second uses the fresh one.
    expect(props.renderWidget).toHaveBeenCalledTimes(2);
  });

  it('does not refresh from the DB on WIDGET_CLICK', async () => {
    const store = require('@/features/widget/storage/widgetStore');
    store.readAgendaSnapshot.mockReturnValue(makeSnapshot('25'));

    const { widgetTaskHandler } = require('@/features/widget/surfaces/homeWidget/homeWidget.android');
    const props = handlerProps('WIDGET_CLICK');
    await widgetTaskHandler(props);

    expect(mockBuildFreshTimeline).not.toHaveBeenCalled();
    expect(store.writeAgendaTimeline).not.toHaveBeenCalled();
    expect(props.renderWidget).toHaveBeenCalledTimes(1);
  });

  it('falls back to the cached snapshot when buildFreshTimeline returns null', async () => {
    const store = require('@/features/widget/storage/widgetStore');
    store.readAgendaSnapshot.mockReturnValue(makeSnapshot('25'));
    mockBuildFreshTimeline.mockResolvedValue(null);

    const { widgetTaskHandler } = require('@/features/widget/surfaces/homeWidget/homeWidget.android');
    const props = handlerProps('WIDGET_UPDATE');
    await widgetTaskHandler(props);

    expect(mockBuildFreshTimeline).toHaveBeenCalledTimes(1);
    expect(store.writeAgendaTimeline).not.toHaveBeenCalled();
    expect(props.renderWidget).toHaveBeenCalledTimes(1);
  });

  it('falls back to the cached snapshot when buildFreshTimeline throws', async () => {
    const store = require('@/features/widget/storage/widgetStore');
    store.readAgendaSnapshot.mockReturnValue(makeSnapshot('25'));
    mockBuildFreshTimeline.mockRejectedValue(new Error('DB locked'));

    const { widgetTaskHandler } = require('@/features/widget/surfaces/homeWidget/homeWidget.android');
    const props = handlerProps('WIDGET_UPDATE');
    await widgetTaskHandler(props);

    expect(props.renderWidget).toHaveBeenCalledTimes(1);
  });
});
