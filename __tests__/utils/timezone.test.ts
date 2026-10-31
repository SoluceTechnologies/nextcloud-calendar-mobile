import {
  zonedWallTimeToUtc, getTimezoneOffsetMinutes,
  zonedUtcToWallDate, wallDateToUtc, resolveAccountTimezone,
} from '@/utils/timezone';
import { buildIcs } from '@/utils/ics';
import { parseIcsItem } from '@/utils/caldav-parse';
import type { Attendee } from '../../src/types';

const meta = { calendarId: 'cal', accountId: 'acc', color: '#3b82f6' };

describe('zonedWallTimeToUtc (inverse of localStamp)', () => {
  it('resolves Europe/Berlin summer wall time (CEST, +02:00)', () => {
    expect(zonedWallTimeToUtc(2026, 8, 1, 15, 0, 0, 'Europe/Berlin').toISOString())
      .toBe('2026-08-01T13:00:00.000Z');
  });

  it('resolves Europe/Berlin winter wall time (CET, +01:00)', () => {
    expect(zonedWallTimeToUtc(2026, 1, 15, 12, 0, 0, 'Europe/Berlin').toISOString())
      .toBe('2026-01-15T11:00:00.000Z');
  });

  it('resolves America/Recife (no DST, -03:00)', () => {
    expect(zonedWallTimeToUtc(2026, 8, 1, 10, 0, 0, 'America/Recife').toISOString())
      .toBe('2026-08-01T13:00:00.000Z');
  });
});

describe('getTimezoneOffsetMinutes', () => {
  it('reports DST-aware offsets', () => {
    expect(getTimezoneOffsetMinutes('Europe/Berlin', new Date('2026-08-01T12:00:00Z'))).toBe(120);
    expect(getTimezoneOffsetMinutes('Europe/Berlin', new Date('2026-01-15T12:00:00Z'))).toBe(60);
    expect(getTimezoneOffsetMinutes('America/Recife', new Date('2026-08-01T12:00:00Z'))).toBe(-180);
  });
});

describe('wall-date conversions (form editing)', () => {
  it('zonedUtcToWallDate returns the zone wall time as a device-local Date', () => {
    // 13:00 UTC is 15:00 in Berlin (CEST) in August.
    const wall = zonedUtcToWallDate(new Date('2026-08-01T13:00:00Z'), 'Europe/Berlin');
    expect([wall.getHours(), wall.getMinutes()]).toEqual([15, 0]);
  });

  it('wallDateToUtc is the exact inverse of zonedUtcToWallDate', () => {
    const instant = new Date('2026-01-15T11:00:00Z');
    const wall = zonedUtcToWallDate(instant, 'America/New_York');
    expect(wallDateToUtc(wall, 'America/New_York').getTime()).toBe(instant.getTime());
  });

  it('keeps the same wall time when switching zones (form semantics)', () => {
    // User typed 14:30 while the event zone was Paris, then switched to Tokyo:
    // the wall time stays, only the instant moves.
    const wall = zonedUtcToWallDate(new Date('2026-08-01T12:30:00Z'), 'Europe/Paris');
    expect(wall.getHours()).toBe(14);
    expect(wall.getMinutes()).toBe(30);
    expect(wallDateToUtc(wall, 'Asia/Tokyo').toISOString()).toBe('2026-08-01T05:30:00.000Z');
  });
});

describe('resolveAccountTimezone', () => {
  it('prefers a valid account zone, then the device zone, then UTC', () => {
    expect(resolveAccountTimezone({ timezone: 'Asia/Tokyo' })).toBe('Asia/Tokyo');
    expect(resolveAccountTimezone({ timezone: 'Bogus/Zone' })).not.toBe('Bogus/Zone');
    expect(resolveAccountTimezone(null)).toBeTruthy();
  });
});

describe('read path: resolves the app\'s own VTIMEZONE-less events', () => {
  const legacyIcs = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nextcloud Calendar Mobile//EN',
    'BEGIN:VEVENT',
    'UID:legacy-1', 'DTSTAMP:20260801T000000Z',
    'DTSTART;TZID=America/Recife:20260801T100000',
    'DTEND;TZID=America/Recife:20260801T110000',
    'SUMMARY:Legacy', 'ORGANIZER;CN=A:mailto:a@example.com',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');

  it('resolves the TZID via Intl regardless of the device zone (10:00 Recife = 13:00 UTC)', () => {
    const [ev] = parseIcsItem({ ics: legacyIcs, href: '/legacy.ics' }, meta);
    expect(ev.dtstart.toISOString()).toBe('2026-08-01T13:00:00.000Z');
    expect(ev.dtend.toISOString()).toBe('2026-08-01T14:00:00.000Z');
  });
});

describe('round-trip: write then read', () => {
  const base = {
    uid: 'rt-1', summary: 'Standup', description: '', location: '',
    organizerEmail: 'a@example.com', organizerName: 'A', attendees: [] as Attendee[],
  };

  it('non-recurring event survives round-trip to the exact instant', () => {
    const dtstart = new Date('2026-08-01T13:00:00Z');
    const dtend = new Date('2026-08-01T14:00:00Z');
    const ics = buildIcs({ ...base, dtstart, dtend, timezone: 'America/Recife' });
    const [ev] = parseIcsItem({ ics, href: '/rt.ics' }, meta);
    expect(ev.dtstart.toISOString()).toBe(dtstart.toISOString());
    expect(ev.dtend.toISOString()).toBe(dtend.toISOString());
  });

  it('recurring event keeps wall-clock time across a DST transition', () => {
    const dtstart = new Date('2026-10-01T13:00:00Z');
    const dtend = new Date('2026-10-01T13:30:00Z');
    const ics = buildIcs({
      ...base, dtstart, dtend, timezone: 'Europe/Berlin', rrule: { freq: 'WEEKLY' },
    });
    const occ = parseIcsItem(
      { ics, href: '/rec.ics' }, meta,
      new Date('2026-09-15T00:00:00Z'), new Date('2026-11-15T00:00:00Z'),
    );
    const starts = occ.map((e) => e.dtstart.toISOString());
    expect(starts).toContain('2026-10-01T13:00:00.000Z');
    expect(starts).toContain('2026-10-29T14:00:00.000Z');
  });
});
