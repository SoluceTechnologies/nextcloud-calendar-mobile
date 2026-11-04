import type { CalendarEvent } from '@/types';

const mockFetch = jest.fn(async () => [] as unknown[]);
const mockQuery = jest.fn(() => ({ fetch: mockFetch }));

jest.mock('@/database', () => ({
    database: { get: jest.fn(() => ({ query: mockQuery })) },
}));

jest.mock('@/database/mappers/event', () => ({
    mapEventToShared: (r: unknown) => r,
}));

jest.mock('@/utils/normalizeEvent', () => ({
    normalizeEvents: (e: unknown) => e,
}));

jest.mock('@/stores/calendarStore', () => ({
    useCalendarStore: { getState: () => ({ hiddenCalendarIds: ['hidden-cal'] }) },
}));

const mockFetchSharees = jest.fn();
jest.mock('@/services/nextcloud/sharees', () => ({
    fetchSharees: (a: unknown) => mockFetchSharees(a),
}));

import {
    eventsOnDay,
    nextEventAfter,
    findEventTargets,
    resolveAttendeeNames,
    inputFromCreateIntent,
    movedDates,
    findFreeSlots,
    busyCalendarIds,
} from '@/services/voice/actions';

function ev(partial: Partial<CalendarEvent> & { dtstart: Date; dtend: Date }): CalendarEvent {
    return {
        uid: 'u', href: '/u.ics', calendarId: 'c1', accountId: 'a1',
        summary: 'Event', allDay: false, color: '#3b82f6', attendees: [],
        isRecurring: false,
        ...partial,
    };
}

const account = { baseUrl: 'https://nc.test', username: 'u', appPassword: 'p' };

describe('eventsOnDay / nextEventAfter', () => {
    beforeEach(() => {
        mockFetch.mockReset();
        mockQuery.mockClear();
    });

    it('returns rows of the day minus hidden calendars', async () => {
        const day = new Date(2026, 10, 4, 12);
        mockFetch.mockResolvedValueOnce([
            ev({ uid: 'a', calendarId: 'c1', dtstart: new Date(2026, 10, 4, 9), dtend: new Date(2026, 10, 4, 10) }),
            ev({ uid: 'b', calendarId: 'hidden-cal', dtstart: new Date(2026, 10, 4, 9), dtend: new Date(2026, 10, 4, 10) }),
        ]);
        const events = await eventsOnDay('a1', day);
        expect(events.map((e) => e.uid)).toEqual(['a']);
    });

    it('nextEventAfter picks the first event still running or later', async () => {
        const now = new Date(2026, 10, 4, 12, 0);
        mockFetch.mockResolvedValueOnce([
            ev({ uid: 'past', dtstart: new Date(2026, 10, 4, 9), dtend: new Date(2026, 10, 4, 10) }),
            ev({ uid: 'later', dtstart: new Date(2026, 10, 4, 15), dtend: new Date(2026, 10, 4, 16) }),
            ev({ uid: 'soon', dtstart: new Date(2026, 10, 4, 13), dtend: new Date(2026, 10, 4, 14) }),
            ev({ uid: 'task', isTask: true, dtstart: new Date(2026, 10, 4, 12, 30), dtend: new Date(2026, 10, 4, 13) }),
        ]);
        const next = await nextEventAfter('a1', now);
        expect(next?.uid).toBe('soon');
    });
});

describe('findEventTargets', () => {
    beforeEach(() => mockFetch.mockReset());

    const rows = [
        ev({ uid: 'call1', summary: 'Call Marc', dtstart: new Date(2026, 10, 5, 15), dtend: new Date(2026, 10, 5, 16) }),
        ev({ uid: 'call2', summary: 'Call Sophie', dtstart: new Date(2026, 10, 6, 15), dtend: new Date(2026, 10, 6, 16) }),
        ev({ uid: 'other', summary: 'Dentist', dtstart: new Date(2026, 10, 5, 9), dtend: new Date(2026, 10, 5, 10) }),
    ];

    it('matches by title substring, case-insensitive', async () => {
        mockFetch.mockResolvedValueOnce(rows);
        const found = await findEventTargets('a1', { title: 'call' });
        expect(found.map((e) => e.uid)).toEqual(['call1', 'call2']);
    });

    it('narrows to the same day then hour when a when is spoken', async () => {
        mockFetch.mockResolvedValueOnce(rows);
        const found = await findEventTargets('a1', {
            title: 'call',
            when: new Date(2026, 10, 5, 15, 0),
        });
        expect(found.map((e) => e.uid)).toEqual(['call1']);
    });

    it('empty title matches everything in the window', async () => {
        mockFetch.mockResolvedValueOnce(rows);
        const found = await findEventTargets('a1', {});
        expect(found).toHaveLength(3);
    });

    it('a spoken day with no match returns nothing — never another day', async () => {
        mockFetch.mockResolvedValueOnce(rows);
        const found = await findEventTargets('a1', {
            title: 'call',
            when: new Date(2026, 10, 10, 15, 0), // no 'call' on Nov 10
        });
        expect(found).toEqual([]);
    });
});

describe('resolveAttendeeNames', () => {
    beforeEach(() => mockFetchSharees.mockReset());

    it('unique exact match resolves to an attendee', async () => {
        mockFetchSharees.mockResolvedValueOnce([
            { id: '1', displayName: 'Marc Dupont', email: 'marc@x.fr', source: 'user' },
        ]);
        const r = await resolveAttendeeNames(account, ['marc']);
        expect(r.attendees).toEqual([{ email: 'marc@x.fr', displayName: 'Marc Dupont' }]);
        expect(r.ambiguous).toEqual([]);
    });

    it('multiple matches stay ambiguous — never guesses', async () => {
        mockFetchSharees.mockResolvedValueOnce([
            { id: '1', displayName: 'Marc A', email: 'marc.a@x.fr', source: 'user' },
            { id: '2', displayName: 'Marc B', email: 'marc.b@x.fr', source: 'user' },
        ]);
        const r = await resolveAttendeeNames(account, ['marc']);
        expect(r.attendees).toEqual([]);
        expect(r.ambiguous).toEqual(['marc']);
    });

    it('offline lookup → name is dropped, not fatal', async () => {
        mockFetchSharees.mockRejectedValueOnce(new Error('offline'));
        const r = await resolveAttendeeNames(account, ['marc']);
        expect(r.attendees).toEqual([]);
        expect(r.ambiguous).toEqual(['marc']);
    });
});

describe('inputFromCreateIntent / movedDates', () => {
    const ctx = { calendarId: 'cal1', organizerEmail: 'me@x.fr', organizerName: 'Me', attendees: [] as { email: string }[] };

    it('builds a 1-hour input when no end is spoken', () => {
        const start = new Date(2026, 10, 5, 14, 30);
        const input = inputFromCreateIntent({ kind: 'create', summary: 'Dentiste', start }, ctx, new Date(2026, 10, 4));
        expect(input.calendarId).toBe('cal1');
        expect(input.dtstart).toEqual(start);
        expect(input.dtend.getTime() - input.dtstart.getTime()).toBe(3_600_000);
        expect(input.summary).toBe('Dentiste');
    });

    it('clamps a past start onto now (voice said today, no time)', () => {
        const now = new Date(2026, 10, 4, 15);
        const input = inputFromCreateIntent({ kind: 'create', start: new Date(2026, 10, 4, 0, 0) }, ctx, now);
        expect(input.dtstart).toEqual(now);
    });

    it('a spoken day without time (midnight sentinel) lands at 9am, not midnight', () => {
        const tomorrowMidnight = new Date(2026, 10, 5, 0, 0);
        const input = inputFromCreateIntent(
            { kind: 'create', summary: 'Dentiste', start: tomorrowMidnight },
            ctx,
            new Date(2026, 10, 4, 15),
        );
        expect(input.dtstart).toEqual(new Date(2026, 10, 5, 9, 0));
    });

    it('a past spoken interval is shifted forward — never emits dtend <= dtstart', () => {
        const now = new Date(2026, 10, 4, 16, 0);
        const input = inputFromCreateIntent(
            { kind: 'create', summary: 'call', start: new Date(2026, 10, 4, 14), end: new Date(2026, 10, 4, 15) },
            ctx,
            now,
        );
        expect(input.dtstart).toEqual(now);
        expect(input.dtend.getTime()).toBeGreaterThan(input.dtstart.getTime());
        expect(input.dtend.getTime() - input.dtstart.getTime()).toBe(3_600_000); // spoken duration kept
    });

    it('movedDates preserves the duration', () => {
        const e = ev({
            dtstart: new Date(2026, 10, 5, 15),
            dtend: new Date(2026, 10, 5, 16, 30),
        });
        const { dtstart, dtend } = movedDates(e, new Date(2026, 10, 5, 17));
        expect(dtend.getTime() - dtstart.getTime()).toBe(90 * 60_000);
    });
});

describe('findFreeSlots', () => {
    const day = new Date(2026, 10, 5); // Thu 5 Nov 2026
    const at = (h: number, m = 0) => new Date(2026, 10, 5, h, m);
    const hours = (slots: { start: Date; end: Date }[]) =>
        slots.map((s) => [s.start.getHours() + s.start.getMinutes() / 60, s.end.getHours() + s.end.getMinutes() / 60]);

    it('empty day → 3 spread starts inside 09:00–18:00', () => {
        expect(hours(findFreeSlots([], day))).toEqual([[9, 10], [13, 14], [17, 18]]);
    });

    it('busy events carve gaps; first/mid/last per gap', () => {
        const busy = [ev({ dtstart: at(10), dtend: at(11) }), ev({ dtstart: at(14), dtend: at(16) })];
        // gaps: 09–10 → [9]; 11–14 → 11, 12, 13; 16–18 → 16, 16:30, 17 — capped at max=6
        expect(hours(findFreeSlots(busy, day))).toEqual([[9, 10], [11, 12], [12, 13], [13, 14], [16, 17], [16.5, 17.5]]);
    });

    it('a gap shorter than the duration gives nothing; a timed full-day block does', () => {
        const packed = [ev({ dtstart: at(9), dtend: at(11, 30) }), ev({ dtstart: at(11, 30), dtend: at(18) })];
        expect(findFreeSlots(packed, day)).toEqual([]);
        const allDay = [ev({ allDay: true, dtstart: at(0), dtend: new Date(2026, 10, 6, 0) })];
        // all-day banners don't block — they are rosters/labels, not meetings
        expect(hours(findFreeSlots(allDay, day))).toEqual([[9, 10], [13, 14], [17, 18]]);
    });

    it('duration filters: «pendant 2h» needs ≥ 2h gaps', () => {
        const busy = [ev({ dtstart: at(10), dtend: at(11) }), ev({ dtstart: at(12), dtend: at(13) })];
        // gaps: 9–10(1h ✗), 11–12(1h ✗), 13–18(5h ✓ → first 13, last floor(18-2)=16, mid align(14:30)=14:30)
        expect(hours(findFreeSlots(busy, day, { durationMin: 120 }))).toEqual([[13, 15], [14.5, 16.5], [16, 18]]);
    });

    it('minStart keeps today proposals in the future', () => {
        const slots = findFreeSlots([], day, { minStart: at(15, 20) });
        expect(hours(slots)).toEqual([[15.5, 16.5], [16.5, 17.5], [17, 18]]);
    });
});

describe('busyCalendarIds', () => {
    const cals = [
        { id: 'perso' },
        { id: 'boulot' },
        { id: 'clara', isReadOnly: true },
        { id: 'deck', isReadOnly: true },
    ];

    it('defaults: writable counts, read-only is informational', () => {
        expect(busyCalendarIds(cals)).toEqual(new Set(['perso', 'boulot']));
    });

    it('override can mark a read-only calendar as blocking', () => {
        expect(busyCalendarIds(cals, { clara: true })).toEqual(new Set(['perso', 'boulot', 'clara']));
    });

    it('override can mark a writable calendar as non-blocking', () => {
        expect(busyCalendarIds(cals, { boulot: false })).toEqual(new Set(['perso']));
    });
});
