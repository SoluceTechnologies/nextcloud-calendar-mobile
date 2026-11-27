import { createRef } from 'react';
import { FlatList } from 'react-native';
import { act, render as rtlRender } from '@testing-library/react-native';
import { ThemeWrapper } from '../../helpers/theme';
import { AgendaView, type AgendaViewHandle } from '@/features/calendar/components/AgendaView';
import type { CalendarEvent } from '@/types';

const render = (ui: React.ReactElement) => rtlRender(ui, { wrapper: ThemeWrapper });

function renderAgenda() {
  const ref = createRef<AgendaViewHandle>();
  const screen = render(
    <AgendaView
      ref={ref}
      events={[]}
      date={new Date()}
      onPressEvent={jest.fn()}
      onPressCell={jest.fn()}
    />,
  );
  return { ref, list: screen.UNSAFE_getByType(FlatList) };
}

const scrollEventAt = (y: number, contentHeight = 10_000, viewportHeight = 800) => ({
  nativeEvent: {
    contentOffset: { x: 0, y },
    contentSize: { width: 400, height: contentHeight },
    layoutMeasurement: { width: 400, height: viewportHeight },
  },
});

describe('AgendaView scrollToToday', () => {
  let scrollSpy: jest.SpyInstance;

  beforeEach(() => {
    scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
  });

  it('collapses a double-press into a single scroll (#348)', () => {
    const { ref } = renderAgenda();

    ref.current!.scrollToToday();
    ref.current!.scrollToToday();

    expect(scrollSpy).toHaveBeenCalledTimes(1);
    expect(scrollSpy).toHaveBeenCalledWith({ offset: expect.any(Number), animated: false });
  });

  it('scrolls again once the guard window has passed', () => {
    const { ref } = renderAgenda();
    const nowSpy = jest.spyOn(Date, 'now');
    let now = 1_000_000;
    nowSpy.mockImplementation(() => now);
    try {
      ref.current!.scrollToToday();
      now += 600;
      ref.current!.scrollToToday();
      expect(scrollSpy).toHaveBeenCalledTimes(2);
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('re-issues the jump while the reported position is off-target (#348)', () => {
    const { ref, list } = renderAgenda();

    ref.current!.scrollToToday();
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    list.props.onScroll(scrollEventAt(0));
    expect(scrollSpy).toHaveBeenCalledTimes(2);

    list.props.onScroll(scrollEventAt(0));
    expect(scrollSpy).toHaveBeenCalledTimes(3);

    list.props.onScroll(scrollEventAt(scrollSpy.mock.calls[0][0].offset));
  });

  it('stops re-issuing once the target offset is reached', () => {
    const { ref, list } = renderAgenda();

    ref.current!.scrollToToday();
    const targetY = scrollSpy.mock.calls[0][0].offset;

    list.props.onScroll(scrollEventAt(0));
    expect(scrollSpy).toHaveBeenCalledTimes(2);

    // Landed: further scroll events must not trigger more jumps
    list.props.onScroll(scrollEventAt(targetY));
    list.props.onScroll(scrollEventAt(0));
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it('yields to the user when they grab the list mid-jump', () => {
    const { ref, list } = renderAgenda();

    ref.current!.scrollToToday();
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    list.props.onScrollBeginDrag();
    list.props.onScroll(scrollEventAt(700));
    list.props.onScrollEndDrag();

    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AgendaView incremental window', () => {
  let scrollSpy: jest.SpyInstance;

  beforeEach(() => {
    scrollSpy = jest.spyOn(FlatList.prototype, 'scrollToOffset').mockImplementation(() => {});
  });

  afterEach(() => {
    scrollSpy.mockRestore();
  });

  it('does not materialize the full four-year range on first render', () => {
    const { list } = renderAgenda();

    expect(list.props.data.length).toBeLessThan(150);
  });

  it('prepends past days near the start and preserves the visual anchor', () => {
    const { list } = renderAgenda();
    const initialLength = list.props.data.length;

    act(() => {
      list.props.onScrollBeginDrag();
      list.props.onScroll(scrollEventAt(100));
    });

    expect(list.props.data.length).toBe(initialLength + 60);
    const correction = scrollSpy.mock.calls.at(-1)?.[0];
    expect(correction?.animated).toBe(false);
    expect(correction?.offset).toBeGreaterThan(3000);

    act(() => {
      list.props.onScrollEndDrag();
    });
  });

  it('appends future days when the end is reached', () => {
    const { list } = renderAgenda();
    const initialLength = list.props.data.length;

    act(() => {
      list.props.onEndReached();
    });

    expect(list.props.data.length).toBe(initialLength + 60);
  });

  it('re-issues the automatic anchor correction when events arrive after the first render', () => {
    const ref = createRef<AgendaViewHandle>();
    const props = {
      date: new Date(),
      onPressEvent: jest.fn(),
      onPressCell: jest.fn(),
    };
    const screen = render(<AgendaView ref={ref} events={[]} {...props} />);
    scrollSpy.mockClear();

    const start = new Date();
    start.setDate(start.getDate() - 10);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start);
    end.setHours(11, 0, 0, 0);
    const event: CalendarEvent = {
      uid: 'late-event',
      href: 'https://example.test/late-event.ics',
      calendarId: 'calendar',
      accountId: 'account',
      summary: 'Late event',
      dtstart: start,
      dtend: end,
      allDay: false,
      color: '#0082c9',
      attendees: [],
      isRecurring: false,
    };

    screen.rerender(<AgendaView ref={ref} events={[event]} {...props} />);
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    const list = screen.UNSAFE_getByType(FlatList);
    act(() => {
      list.props.onScroll(scrollEventAt(0));
    });

    expect(scrollSpy).toHaveBeenCalledTimes(2);
    expect(scrollSpy.mock.calls[1][0].offset).toBe(scrollSpy.mock.calls[0][0].offset);
  });
});
