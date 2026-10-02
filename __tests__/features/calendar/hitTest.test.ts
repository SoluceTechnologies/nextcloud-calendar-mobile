import { hitTestEvent } from '@/features/calendar/utils/hitTest';
import type { PositionedEvent } from '@/features/calendar/utils/eventLayout';
import type { GridEvent } from '@/features/calendar/utils/toGridEvents';
import type { CalendarEvent } from '@/types';

const GRID_HEIGHT = 1440;
const COLUMN_WIDTH = 100;

function ev(uid: string, startMin: number, endMin: number): GridEvent {
  const e: CalendarEvent = {
    uid, href: `/${uid}.ics`, calendarId: 'c1', accountId: 'a1',
    summary: uid,
    dtstart: new Date(2026, 7, 7, Math.floor(startMin / 60), startMin % 60),
    dtend: new Date(2026, 7, 7, Math.floor(endMin / 60), endMin % 60),
    allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
  };
  return { title: uid, start: e.dtstart, end: e.dtend, color: e.color, _event: e };
}

const full = (e: GridEvent, zIndex = 100): PositionedEvent =>
  ({ event: e, leftPct: 0, widthPct: 100, zIndex });

describe('hitTestEvent', () => {
  const twoHour = full(ev('a', 540, 660));

  it('returns null when the point is in an empty gap', () => {
    expect(hitTestEvent(50, 100, [twoHour], COLUMN_WIDTH, GRID_HEIGHT)).toBeNull();
  });

  it('returns null when there are no events', () => {
    expect(hitTestEvent(50, 600, [], COLUMN_WIDTH, GRID_HEIGHT)).toBeNull();
  });

  it('returns move for a touch in the middle of a box', () => {
    const hit = hitTestEvent(50, 600, [twoHour], COLUMN_WIDTH, GRID_HEIGHT);
    expect(hit?.event._event.uid).toBe('a');
    expect(hit?.mode).toBe('move');
  });

  it('returns resizeStart for a touch in the top fifth', () => {
    expect(hitTestEvent(50, 545, [twoHour], COLUMN_WIDTH, GRID_HEIGHT)?.mode).toBe('resizeStart');
  });

  it('returns resizeEnd for a touch in the bottom fifth', () => {
    expect(hitTestEvent(50, 655, [twoHour], COLUMN_WIDTH, GRID_HEIGHT)?.mode).toBe('resizeEnd');
  });

  it('forces move on an event shorter than 45 minutes', () => {
    const short = full(ev('s', 540, 570));
    expect(hitTestEvent(50, 541, [short], COLUMN_WIDTH, GRID_HEIGHT)?.mode).toBe('move');
  });

  it('ignores a touch outside the box horizontally', () => {
    const half: PositionedEvent = { event: ev('h', 540, 660), leftPct: 0, widthPct: 50, zIndex: 100 };
    expect(hitTestEvent(75, 600, [half], COLUMN_WIDTH, GRID_HEIGHT)).toBeNull();
    expect(hitTestEvent(25, 600, [half], COLUMN_WIDTH, GRID_HEIGHT)?.event._event.uid).toBe('h');
  });

  it('picks the highest zIndex when boxes stack', () => {
    const under = full(ev('under', 540, 660), 100);
    const over = full(ev('over', 540, 660), 105);
    const hit = hitTestEvent(50, 600, [under, over], COLUMN_WIDTH, GRID_HEIGHT);
    expect(hit?.event._event.uid).toBe('over');
  });

  it('is inclusive of the box top edge and exclusive of its bottom', () => {
    expect(hitTestEvent(50, 540, [twoHour], COLUMN_WIDTH, GRID_HEIGHT)).not.toBeNull();
    expect(hitTestEvent(50, 660, [twoHour], COLUMN_WIDTH, GRID_HEIGHT)).toBeNull();
  });
});
