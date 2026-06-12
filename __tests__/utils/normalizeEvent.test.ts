import { normalizeEvent, normalizeEvents } from '../../src/utils/normalizeEvent';
import type { CalendarEvent } from '../../src/types';

function makeEvent(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    uid: 'u1',
    href: 'h',
    calendarId: 'c',
    accountId: 'a',
    summary: 's',
    allDay: false,
    color: '#fff',
    attendees: [],
    isRecurring: false,
    dtstart: new Date('2026-01-01T10:00:00Z'),
    dtend: new Date('2026-01-01T11:00:00Z'),
    ...over,
  } as CalendarEvent;
}

describe('normalizeEvent', () => {
  it('returns the same reference when dates are already Date objects', () => {
    const e = makeEvent();
    expect(normalizeEvent(e)).toBe(e);
  });

  it('coerces ISO string dates back to Date objects', () => {
    const e = makeEvent({
      dtstart: '2026-01-01T10:00:00Z' as unknown as Date,
      dtend: '2026-01-01T11:00:00Z' as unknown as Date,
    });
    const n = normalizeEvent(e);
    expect(n).not.toBe(e);
    expect(n.dtstart).toBeInstanceOf(Date);
    expect(n.dtend).toBeInstanceOf(Date);
    expect(n.dtstart.getTime()).toBe(new Date('2026-01-01T10:00:00Z').getTime());
  });
});

describe('normalizeEvents', () => {
  it('preserves array identity when nothing needs coercion', () => {
    const arr = [makeEvent(), makeEvent({ uid: 'u2' })];
    expect(normalizeEvents(arr)).toBe(arr);
  });

  it('returns a new array when any event needed coercion', () => {
    const arr = [
      makeEvent(),
      makeEvent({ uid: 'u2', dtstart: '2026-01-02T10:00:00Z' as unknown as Date }),
    ];
    const out = normalizeEvents(arr);
    expect(out).not.toBe(arr);
    expect(out[1].dtstart).toBeInstanceOf(Date);
  });
});
