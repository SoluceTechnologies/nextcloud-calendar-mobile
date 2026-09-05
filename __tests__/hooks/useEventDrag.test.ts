import { renderHook, act } from '@testing-library/react-native';
import { useEventDrag } from '@/features/calendar/hooks/useEventDrag';
import { layoutDay } from '@/features/calendar/utils/eventLayout';
import { buildDayIndex } from '@/features/calendar/utils/grid';
import { SNAP_MINUTES } from '@/features/calendar/utils/dragMath';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

const HOUR_ROW_HEIGHT = 60;
const COLUMN_WIDTH = 100;

function gridEvent(uid: string, startHour: number, durationMin: number): GridEvent {
  const start = new Date(2026, 7, 7, startHour, 0);
  const end = new Date(start.getTime() + durationMin * 60_000);
  const e: CalendarEvent = {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid, dtstart: start, dtend: end,
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
  };
  return { title: uid, start, end, color: e.color, _event: e };
}

function setup(events: GridEvent[], onMoveEvent = jest.fn()) {
  const layouts = [layoutDay(events)];
  const { result } = renderHook(() =>
    useEventDrag({
      dates: [events[0].start],
      layouts,
      hourRowHeight: HOUR_ROW_HEIGHT,
      columnWidth: COLUMN_WIDTH,
      onMoveEvent,
    })
  );
  return { result, onMoveEvent };
}

describe('useEventDrag', () => {
  it('a gesture with no movement commits nothing', () => {
    const event = gridEvent('a', 9, 60);
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 0 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 0 } as never, true);
    });

    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  it('a move commits the snapped delta', () => {
    const event = gridEvent('a', 9, 60);
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
    });

    expect(onMoveEvent).toHaveBeenCalledTimes(1);
    const [calledEvent, nextStart, nextEnd] = onMoveEvent.mock.calls[0];
    expect(calledEvent).toBe(event);
    expect(nextStart).toEqual(new Date(2026, 7, 7, 9, 30));
    expect(nextEnd).toEqual(new Date(2026, 7, 7, 10, 30));
  });

  it('refuses to arm a drag on a task (VTODO) event', () => {
    const event = gridEvent('a', 9, 60);
    event._event.isTask = true;
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
    });

    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  it('refuses to arm a drag on a read-only / subscribed calendar event', () => {
    const event = gridEvent('a', 9, 60);
    event._event.readOnly = true;
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
    });

    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  it('a resize that overshoots the floor commits the clamped duration rather than nothing', () => {
    const event = gridEvent('a', 9, 60);
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 545 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 90 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 90 } as never, true);
    });

    expect(onMoveEvent).toHaveBeenCalledTimes(1);
    const [, nextStart, nextEnd] = onMoveEvent.mock.calls[0];
    expect(nextEnd).toEqual(event.end);
    expect(nextStart).toEqual(new Date(nextEnd.getTime() - SNAP_MINUTES * 60_000));
  });

  it('a resizeEnd overshoot in the other direction also clamps instead of committing nothing', () => {
    const event = gridEvent('a', 9, 60);
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 595 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: -90 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: -90 } as never, true);
    });

    expect(onMoveEvent).toHaveBeenCalledTimes(1);
    const [, nextStart, nextEnd] = onMoveEvent.mock.calls[0];
    expect(nextStart).toEqual(event.start);
    expect(nextEnd).toEqual(new Date(nextStart.getTime() + SNAP_MINUTES * 60_000));
  });

  it('does nothing when the page has not been measured yet (columnWidth 0)', () => {
    const event = gridEvent('a', 9, 60);
    const { result: unmeasured } = renderHook(() =>
      useEventDrag({
        dates: [event.start],
        layouts: [layoutDay([event])],
        hourRowHeight: HOUR_ROW_HEIGHT,
        columnWidth: 0,
        onMoveEvent: jest.fn(),
      })
    );

    expect(() => {
      act(() => {
        unmeasured.current.gesture.handlers.onStart?.({ x: 0, y: 570 } as never);
      });
    }).not.toThrow();
    expect(unmeasured.current.drag).toBeNull();
  });

  it('refuses to arm a drag on a midnight-clamped slice of a multi-day event', () => {
    const start = new Date(2026, 7, 7, 22, 0);
    const end = new Date(2026, 7, 8, 3, 0);
    const full: CalendarEvent = {
      uid: 'oncall', href: '/oncall.ics', calendarId: 'c1', accountId: 'a1',
      summary: 'oncall', dtstart: start, dtend: end,
      allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
    };
    const wholeEvent: GridEvent = { title: 'oncall', start, end, color: full.color, _event: full };
    const dayIndex = buildDayIndex([wholeEvent]);
    const slice = dayIndex.get('2026-08-07')![0];
    expect(slice.end.getTime()).not.toBe(full.dtend.getTime());

    const onMoveEvent = jest.fn();
    const { result } = renderHook(() =>
      useEventDrag({
        dates: [start],
        layouts: [layoutDay([slice])],
        hourRowHeight: HOUR_ROW_HEIGHT,
        columnWidth: COLUMN_WIDTH,
        onMoveEvent,
      })
    );

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 1380 } as never); });
    expect(result.current.drag).toBeNull();

    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 30 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 30 } as never, true);
    });

    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  it('does not commit a cancelled gesture (onEnd success: false)', () => {
    const event = gridEvent('a', 9, 60);
    const { result, onMoveEvent } = setup([event]);

    act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
    act(() => {
      result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
      result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, false);
    });

    expect(onMoveEvent).not.toHaveBeenCalled();
  });

  describe('holds the ghost until the move lands (no flash-back)', () => {
    const movedStart = new Date(2026, 7, 7, 9, 30);
    const movedEnd = new Date(2026, 7, 7, 10, 30);

    function movedLayout(event: GridEvent) {
      const moved: GridEvent = {
        ...event,
        start: movedStart,
        end: movedEnd,
        _event: { ...event._event, dtstart: movedStart, dtend: movedEnd },
      };
      return [layoutDay([moved])];
    }

    it('keeps the drag in a settling phase after a committed move, then clears it once the event re-renders at the new bounds', () => {
      const event = gridEvent('a', 9, 60);
      const onMoveEvent = jest.fn();
      const props = {
        dates: [event.start],
        layouts: [layoutDay([event])],
        hourRowHeight: HOUR_ROW_HEIGHT,
        columnWidth: COLUMN_WIDTH,
        onMoveEvent,
      };
      const { result, rerender } = renderHook((p: typeof props) => useEventDrag(p), { initialProps: props });

      act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
      act(() => {
        result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
        result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
      });

      expect(onMoveEvent).toHaveBeenCalledTimes(1);
      expect(result.current.drag).not.toBeNull();
      expect(result.current.drag?.settling).toEqual({
        start: movedStart.getTime(),
        end: movedEnd.getTime(),
      });

      act(() => { rerender({ ...props, layouts: movedLayout(event) }); });

      expect(result.current.drag).toBeNull();
    });

    it('onFinalize does not tear down a ghost that has committed into settling', () => {
      const event = gridEvent('a', 9, 60);
      const { result, onMoveEvent } = setup([event]);

      act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
      act(() => {
        result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
        result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
        result.current.gesture.handlers.onFinalize?.({} as never, true);
      });

      expect(onMoveEvent).toHaveBeenCalledTimes(1);
      expect(result.current.drag?.settling).toBeTruthy();
    });

    it('a cancelled gesture with no commit still clears the ghost on finalize', () => {
      const event = gridEvent('a', 9, 60);
      const { result, onMoveEvent } = setup([event]);

      act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
      act(() => {
        result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, false);
        result.current.gesture.handlers.onFinalize?.({} as never, false);
      });

      expect(onMoveEvent).not.toHaveBeenCalled();
      expect(result.current.drag).toBeNull();
    });

    it('the watchdog clears a held ghost when the move never lands (e.g. a cancelled recurrence prompt)', () => {
      jest.useFakeTimers();
      try {
        const event = gridEvent('a', 9, 60);
        const { result } = setup([event]);

        act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
        act(() => {
          result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
          result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
        });
        expect(result.current.drag?.settling).toBeTruthy();

        act(() => { jest.advanceTimersByTime(2500); });

        expect(result.current.drag).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });

    it('the watchdog is not restarted by unrelated re-layouts while the move is settling', () => {
      jest.useFakeTimers();
      try {
        const event = gridEvent('a', 9, 60);
        const other = gridEvent('b', 14, 60);
        const props = {
          dates: [event.start],
          layouts: [layoutDay([event, other])],
          hourRowHeight: HOUR_ROW_HEIGHT,
          columnWidth: COLUMN_WIDTH,
          onMoveEvent: jest.fn(),
        };
        const { result, rerender } = renderHook((p: typeof props) => useEventDrag(p), {
          initialProps: props,
        });

        act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
        act(() => {
          result.current.gesture.handlers.onUpdate?.({ translationX: 0, translationY: 32 } as never);
          result.current.gesture.handlers.onEnd?.({ translationX: 0, translationY: 32 } as never, true);
        });
        expect(result.current.drag?.settling).toBeTruthy();

        for (let i = 0; i < 4; i += 1) {
          act(() => { jest.advanceTimersByTime(600); });
          act(() => { rerender({ ...props, layouts: [layoutDay([event, other])] }); });
        }
        act(() => { jest.advanceTimersByTime(200); });

        expect(result.current.drag).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('cross-column drag', () => {
    const day1 = new Date(2026, 7, 7);
    const day2 = new Date(2026, 7, 8);
    const day3 = new Date(2026, 7, 9);

    it('a +1 column move commits the event shifted by one day', () => {
      const event = gridEvent('a', 9, 60);
      const layouts = [layoutDay([event]), [], []];
      const onMoveEvent = jest.fn();
      const { result } = renderHook(() =>
        useEventDrag({
          dates: [day1, day2, day3],
          layouts,
          hourRowHeight: HOUR_ROW_HEIGHT,
          columnWidth: COLUMN_WIDTH,
          onMoveEvent,
        })
      );

      act(() => { result.current.gesture.handlers.onStart?.({ x: 50, y: 570 } as never); });
      act(() => {
        result.current.gesture.handlers.onUpdate?.({ translationX: COLUMN_WIDTH, translationY: 0 } as never);
        result.current.gesture.handlers.onEnd?.({ translationX: COLUMN_WIDTH, translationY: 0 } as never, true);
      });

      expect(onMoveEvent).toHaveBeenCalledTimes(1);
      const [, nextStart, nextEnd] = onMoveEvent.mock.calls[0];
      expect(nextStart).toEqual(new Date(2026, 7, 8, 9, 0));
      expect(nextEnd).toEqual(new Date(2026, 7, 8, 10, 0));
    });

    it('clamps a leftward drag at the page edge instead of moving off-page', () => {
      const event = gridEvent('a', 9, 60);
      const layouts = [[], layoutDay([event]), []];
      const onMoveEvent = jest.fn();
      const { result } = renderHook(() =>
        useEventDrag({
          dates: [day1, day2, day3],
          layouts,
          hourRowHeight: HOUR_ROW_HEIGHT,
          columnWidth: COLUMN_WIDTH,
          onMoveEvent,
        })
      );

      act(() => { result.current.gesture.handlers.onStart?.({ x: 150, y: 570 } as never); });
      act(() => {
        result.current.gesture.handlers.onUpdate?.({ translationX: -3 * COLUMN_WIDTH, translationY: 0 } as never);
        result.current.gesture.handlers.onEnd?.({ translationX: -3 * COLUMN_WIDTH, translationY: 0 } as never, true);
      });

      expect(onMoveEvent).toHaveBeenCalledTimes(1);
      const [, nextStart, nextEnd] = onMoveEvent.mock.calls[0];
      expect(nextStart).toEqual(new Date(2026, 7, 6, 9, 0));
      expect(nextEnd).toEqual(new Date(2026, 7, 6, 10, 0));
    });
  });
  describe('arming', () => {
    afterEach(() => { jest.restoreAllMocks(); });

    const arm = (result: { current: ReturnType<typeof useEventDrag> }) => {
      const manager = { activate: jest.fn(), fail: jest.fn(), begin: jest.fn(), end: jest.fn() };
      const h = result.current.gesture.handlers;
      act(() => { h.onTouchesDown?.({} as never, manager as never); });
      return { manager, move: () => act(() => { h.onTouchesMove?.({} as never, manager as never); }) };
    };

    it('does not arm the drag while the finger is still inside the long-press window', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_000);
      const { result } = setup([gridEvent('a', 9, 60)]);

      const { manager, move } = arm(result);
      (Date.now as jest.Mock).mockReturnValue(1_000 + 299);
      move();

      expect(manager.activate).not.toHaveBeenCalled();
    });

    // The regression this guards: activateAfterLongPress() made RNGH *fail* the
    // pan on that early drift, so the drag never ran and the event's own
    // TouchableOpacity opened the detail screen on lift instead.
    it('arms the drag after the long-press window even though the finger already moved', () => {
      jest.spyOn(Date, 'now').mockReturnValue(1_000);
      const { result } = setup([gridEvent('a', 9, 60)]);

      const { manager, move } = arm(result);
      (Date.now as jest.Mock).mockReturnValue(1_000 + 120);
      move();
      expect(manager.activate).not.toHaveBeenCalled();

      (Date.now as jest.Mock).mockReturnValue(1_000 + 320);
      move();

      expect(manager.activate).toHaveBeenCalledTimes(1);
    });

    it('never lets a second finger drag, so pinch-zoom keeps both of them', () => {
      const { result } = setup([gridEvent('a', 9, 60)]);
      expect(result.current.gesture.config.maxPointers).toBe(1);
    });
  });
});
