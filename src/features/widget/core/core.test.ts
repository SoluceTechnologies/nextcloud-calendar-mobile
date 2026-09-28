import { buildAgendaSnapshot, buildAgendaTimeline } from '@/features/widget/core/agendaSnapshot';
import { selectOngoingEvent, eventProgress, formatRemaining, remainingMinutes } from '@/features/widget/core/liveEvent';
import type { CalendarEvent } from '@/types';

function ev(partial: Partial<CalendarEvent> & { dtstart: Date; dtend: Date }): CalendarEvent {
  return {
    uid: 'u', href: '/u.ics', calendarId: 'c', accountId: 'a',
    summary: 'Event', allDay: false, color: '#3b82f6', attendees: [],
    isRecurring: false,
    ...partial,
  };
}

const TZ = 'Europe/Berlin';

describe('buildAgendaSnapshot', () => {
  const now = new Date('2026-08-01T09:00:00Z');

  it('keeps only today\'s not-yet-finished events, sorted by start', () => {
    const events = [
      ev({ uid: 'past', summary: 'Past', dtstart: new Date('2026-08-01T07:00:00Z'), dtend: new Date('2026-08-01T08:00:00Z') }),
      ev({ uid: 'later', summary: 'Later', dtstart: new Date('2026-08-01T15:00:00Z'), dtend: new Date('2026-08-01T16:00:00Z') }),
      ev({ uid: 'soon', summary: 'Soon', dtstart: new Date('2026-08-01T12:00:00Z'), dtend: new Date('2026-08-01T13:00:00Z') }),
      ev({ uid: 'tomorrow', summary: 'Tomorrow', dtstart: new Date('2026-08-02T10:00:00Z'), dtend: new Date('2026-08-02T11:00:00Z') }),
    ];
    const snap = buildAgendaSnapshot(events, { now, timeZone: TZ, locale: 'en-US' });
    expect(snap.events.map((e) => e.uid)).toEqual(['soon', 'later']);
    expect(snap.dayNumber).toBe('1');
    expect(snap.timeZone).toBe(TZ);
  });

  it('reports no upcoming event when the day is empty', () => {
    const snap = buildAgendaSnapshot([], { now, timeZone: TZ, locale: 'en-US' });
    expect(snap.events).toHaveLength(0);
    expect(snap.relativeLabel).toBe('No upcoming event');
  });

  it('falls back to a valid colour so an uncoloured event never crashes the native render', () => {
    const events = [
      ev({ uid: 'nocolor', color: undefined as unknown as string, dtstart: new Date('2026-08-01T12:00:00Z'), dtend: new Date('2026-08-01T13:00:00Z') }),
    ];
    const snap = buildAgendaSnapshot(events, { now, timeZone: TZ, locale: 'en-US' });
    expect(snap.events[0].color).toBe('#3b82f6');
  });

  it('respects maxEvents', () => {
    const events = [1, 2, 3, 4].map((h) =>
      ev({ uid: `e${h}`, dtstart: new Date(`2026-08-01T1${h}:00:00Z`), dtend: new Date(`2026-08-01T1${h}:30:00Z`) }),
    );
    expect(buildAgendaSnapshot(events, { now, timeZone: TZ, maxEvents: 2 }).events).toHaveLength(2);
  });

  it('groups the upcoming window into per-day sections', () => {
    const events = [
      ev({ uid: 'past', dtstart: new Date('2026-08-01T07:00:00Z'), dtend: new Date('2026-08-01T08:00:00Z') }),
      ev({ uid: 'soon', dtstart: new Date('2026-08-01T12:00:00Z'), dtend: new Date('2026-08-01T13:00:00Z') }),
      ev({ uid: 'tomorrow', dtstart: new Date('2026-08-02T10:00:00Z'), dtend: new Date('2026-08-02T11:00:00Z') }),
    ];
    const snap = buildAgendaSnapshot(events, { now, timeZone: TZ, locale: 'en-US', days: 1 });

    expect(snap.sections).toHaveLength(2);
    expect(snap.sections[0].isToday).toBe(true);
    expect(snap.sections[0].items.map((e) => e.uid)).toEqual(['soon']); // past dropped
    expect(snap.sections[1].isToday).toBe(false);
    expect(snap.sections[1].items.map((e) => e.uid)).toEqual(['tomorrow']);
    expect(snap.nextEvent?.uid).toBe('soon');
  });

  it('keeps today section even when empty and picks nextEvent from a later day', () => {
    const events = [
      ev({ uid: 'past', dtstart: new Date('2026-08-01T07:00:00Z'), dtend: new Date('2026-08-01T08:00:00Z') }),
      ev({ uid: 'tomorrow', dtstart: new Date('2026-08-02T10:00:00Z'), dtend: new Date('2026-08-02T11:00:00Z') }),
    ];
    const snap = buildAgendaSnapshot(events, { now, timeZone: TZ, locale: 'en-US', days: 1 });

    expect(snap.sections[0].isToday).toBe(true);
    expect(snap.sections[0].items).toHaveLength(0);
    expect(snap.nextEvent?.uid).toBe('tomorrow');
  });

  it('has a today-only section and nextEvent by default (days=0)', () => {
    const snap = buildAgendaSnapshot([], { now, timeZone: TZ, locale: 'en-US' });
    expect(snap.sections).toHaveLength(1);
    expect(snap.sections[0].isToday).toBe(true);
    expect(snap.nextEvent).toBeUndefined();
  });
});

describe('selectOngoingEvent', () => {
  const now = new Date('2026-08-01T12:30:00Z');

  it('picks the ongoing timed event ending soonest', () => {
    const events = [
      ev({ uid: 'long', dtstart: new Date('2026-08-01T12:00:00Z'), dtend: new Date('2026-08-01T14:00:00Z') }),
      ev({ uid: 'short', dtstart: new Date('2026-08-01T12:15:00Z'), dtend: new Date('2026-08-01T13:00:00Z') }),
      ev({ uid: 'future', dtstart: new Date('2026-08-01T13:00:00Z'), dtend: new Date('2026-08-01T14:00:00Z') }),
    ];
    expect(selectOngoingEvent(events, now)?.uid).toBe('short');
  });

  it('ignores all-day events and returns null when nothing is ongoing', () => {
    const events = [
      ev({ uid: 'allday', allDay: true, dtstart: new Date('2026-08-01T00:00:00Z'), dtend: new Date('2026-08-02T00:00:00Z') }),
      ev({ uid: 'past', dtstart: new Date('2026-08-01T08:00:00Z'), dtend: new Date('2026-08-01T09:00:00Z') }),
    ];
    expect(selectOngoingEvent(events, now)).toBeNull();
  });
});

describe('eventProgress / remainingMinutes', () => {
  const state = {
    uid: 'u', title: 'T', color: '#000', link: 'x',
    startIso: '2026-08-01T12:00:00Z', endIso: '2026-08-01T13:00:00Z',
    location: '', attendees: [],
  };

  it('computes clamped progress and remaining minutes', () => {
    expect(eventProgress(state, new Date('2026-08-01T12:15:00Z'))).toBeCloseTo(0.25);
    expect(eventProgress(state, new Date('2026-08-01T11:00:00Z'))).toBe(0);
    expect(eventProgress(state, new Date('2026-08-01T14:00:00Z'))).toBe(1);
    expect(remainingMinutes(state, new Date('2026-08-01T12:45:00Z'))).toBe(15);
  });
});

describe('formatRemaining', () => {
  it('renders hours and minutes without a "min" unit', () => {
    expect(formatRemaining(206)).toBe('3h26');
    expect(formatRemaining(94)).toBe('1h34');
  });

  it('drops the minute part on a whole hour', () => {
    expect(formatRemaining(120)).toBe('2h');
  });

  it('renders sub-hour durations in minutes', () => {
    expect(formatRemaining(47)).toBe('47m');
    expect(formatRemaining(0)).toBe('0m');
  });

  it('pads the minute part so 2h05 never reads as 2h5', () => {
    expect(formatRemaining(125)).toBe('2h05');
  });

  it('clamps negatives instead of rendering a past duration', () => {
    expect(formatRemaining(-30)).toBe('0m');
  });

  it('takes localized unit suffixes', () => {
    expect(formatRemaining(206, { hour: 'ч', minute: 'м' })).toBe('3ч26');
    expect(formatRemaining(47, { hour: 'ч', minute: 'м' })).toBe('47м');
  });
});

describe('buildAgendaTimeline', () => {
  const now = new Date('2026-08-01T09:00:00Z');

  it('starts at now and adds an entry for each event end still ahead', () => {
    const events = [
      ev({ uid: 'past', dtstart: new Date('2026-08-01T07:00:00Z'), dtend: new Date('2026-08-01T08:00:00Z') }),
      ev({ uid: 'soon', dtstart: new Date('2026-08-01T10:00:00Z'), dtend: new Date('2026-08-01T12:00:00Z') }),
    ];
    const timeline = buildAgendaTimeline(events, { now, timeZone: TZ, locale: 'en-US' });

    expect(timeline[0].atIso).toBe(now.toISOString());
    expect(timeline.map((e) => e.atIso)).toContain('2026-08-01T12:00:00.000Z');
    expect(timeline.every((e, i) => i === 0 || e.atIso > timeline[i - 1].atIso)).toBe(true);
  });

  it('adds the local midnight so the day rolls over on its own', () => {
    const timeline = buildAgendaTimeline([], { now, timeZone: TZ, locale: 'en-US' });
    expect(timeline.map((e) => e.atIso)).toContain('2026-08-01T22:00:00.000Z');
  });

  it('drops a finished event from the entry that follows its end', () => {
    const events = [
      ev({ uid: 'ends', dtstart: new Date('2026-08-01T10:00:00Z'), dtend: new Date('2026-08-01T12:00:00Z') }),
    ];
    const timeline = buildAgendaTimeline(events, { now, timeZone: TZ, locale: 'en-US' });

    expect(timeline[0].snapshot.events.map((e) => e.uid)).toEqual(['ends']);
    const afterEnd = timeline.find((e) => e.atIso === '2026-08-01T12:00:00.000Z');
    expect(afterEnd?.snapshot.events).toHaveLength(0);
  });

  it('builds a constant number of date formatters, not one per event per entry', () => {
    const events = Array.from({ length: 300 }, (_, i) =>
      ev({
        uid: `e${i}`,
        dtstart: new Date(now.getTime() + i * 3 * 60_000),
        dtend: new Date(now.getTime() + (i * 3 + 30) * 60_000),
      }),
    );

    jest.resetModules();
    const Real = Intl.DateTimeFormat;
    let built = 0;
    const counting = function (this: unknown, ...args: unknown[]) {
      built += 1;
      return new (Real as unknown as new (...a: unknown[]) => Intl.DateTimeFormat)(...args);
    } as unknown as typeof Intl.DateTimeFormat;
    counting.supportedLocalesOf = Real.supportedLocalesOf;
    Intl.DateTimeFormat = counting;

    try {
      const fresh = require('@/features/widget/core/agendaSnapshot') as typeof import('@/features/widget/core/agendaSnapshot');
      fresh.buildAgendaTimeline(events, { now, timeZone: TZ, locale: 'en-US', days: 7, maxPerSection: 10 });
    } finally {
      Intl.DateTimeFormat = Real;
    }

    expect(built).toBeLessThan(20);
  });

  it('ignores event ends beyond the horizon and caps the entry count', () => {
    const events = Array.from({ length: 40 }, (_, i) =>
      ev({
        uid: `e${i}`,
        dtstart: new Date(now.getTime() + i * 60_000),
        dtend: new Date(now.getTime() + (i + 1) * 60_000),
      }),
    );
    const timeline = buildAgendaTimeline(events, { now, timeZone: TZ, locale: 'en-US' }, 10);
    expect(timeline).toHaveLength(10);
  });
});
