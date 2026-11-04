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

    it('movedDates preserves the duration', () => {
        const e = ev({
            dtstart: new Date(2026, 10, 5, 15),
            dtend: new Date(2026, 10, 5, 16, 30),
        });
        const { dtstart, dtend } = movedDates(e, new Date(2026, 10, 5, 17));
        expect(dtend.getTime() - dtstart.getTime()).toBe(90 * 60_000);
    });
});
