import { zonedWallTimeToUtc, getTimezoneOffsetMinutes } from '@/utils/timezone';
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

  it('recurring event keeps wall-clock end times across a DST transition', () => {
    const dtstart = new Date('2026-10-01T13:00:00Z');
    const dtend = new Date('2026-10-01T13:30:00Z');
    const ics = buildIcs({
      ...base, dtstart, dtend, timezone: 'Europe/Berlin', rrule: { freq: 'WEEKLY' },
    });
    const occ = parseIcsItem(
      { ics, href: '/rec.ics' }, meta,
      new Date('2026-09-15T00:00:00Z'), new Date('2026-11-15T00:00:00Z'),
    );
    const byStart = new Map(occ.map((e) => [e.dtstart.toISOString(), e.dtend.toISOString()]));
    // Before the transition (CEST, +02:00): 15:00–15:30 wall = 13:00–13:30 UTC.
    expect(byStart.get('2026-10-01T13:00:00.000Z')).toBe('2026-10-01T13:30:00.000Z');
    // After the transition (CET, +01:00): 15:00–15:30 wall = 14:00–14:30 UTC.
    expect(byStart.get('2026-10-29T14:00:00.000Z')).toBe('2026-10-29T14:30:00.000Z');
  });

  it('expands a multi-day all-day series with a constant day span', () => {
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN',
      'BEGIN:VEVENT',
      'UID:allday-multi', 'DTSTAMP:20260801T000000Z',
      'DTSTART;VALUE=DATE:20261001',
      'DTEND;VALUE=DATE:20261003',
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'SUMMARY:Retreat',
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const occ = parseIcsItem(
      { ics, href: '/allday.ics' }, meta,
      new Date('2026-09-01T00:00:00Z'), new Date('2026-12-01T00:00:00Z'),
    );
    expect(occ).toHaveLength(3);
    const spans = occ.map((e) => e.dtend.getTime() - e.dtstart.getTime());
    expect(new Set(spans).size).toBe(1);
    for (let i = 1; i < occ.length; i++) {
      expect(occ[i].dtstart.getTime() - occ[i - 1].dtstart.getTime()).toBe(7 * 86_400_000);
    }
  });
});
