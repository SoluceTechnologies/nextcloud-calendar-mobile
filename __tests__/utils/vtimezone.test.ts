import ICAL from 'ical.js';
import { formatUtcOffset, gmtOffsetLabel, vtimezoneLines } from '@/utils/vtimezone';
import { zonedWallTimeToUtc } from '@/utils/timezone';

function zoneFromLines(lines: string[], tzid: string): ICAL.Timezone {
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', ...lines, 'END:VCALENDAR'].join('\r\n');
  const comp = new ICAL.Component(ICAL.parse(ics));
  const zone = ICAL.Timezone.fromData({
    component: comp.getFirstSubcomponent('vtimezone')!,
    tzid,
  });
  return zone;
}

/** UTC instant at which `zone` places the given local wall time. */
function utcAt(zone: ICAL.Timezone, wall: string): number {
  const d = new Date(`${wall}Z`); // wall components only
  const t = ICAL.Time.fromData(
    {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
    },
    zone,
  );
  return t.toUnixTime() * 1000;
}

/** Collects the generated observance blocks of one kind (BEGIN:xxx … END:xxx). */
function observanceBlocks(lines: string[], kind: 'STANDARD' | 'DAYLIGHT'): string[][] {
  const blocks: string[][] = [];
  let cur: string[] | null = null;
  for (const line of lines) {
    if (line === `BEGIN:${kind}`) {
      cur = [line];
    } else if (line.startsWith('BEGIN:')) {
      cur = null; // VTIMEZONE or the other observance kind
    } else if (cur) {
      cur.push(line);
      if (line === `END:${kind}`) {
        blocks.push(cur);
        cur = null;
      }
    }
  }
  return blocks;
}

describe('formatUtcOffset', () => {
  it('formats positive, negative and zero offsets', () => {
    expect(formatUtcOffset(120)).toBe('+0200');
    expect(formatUtcOffset(-300)).toBe('-0500');
    expect(formatUtcOffset(0)).toBe('+0000');
    expect(formatUtcOffset(330)).toBe('+0530');
    expect(formatUtcOffset(-45)).toBe('-0045');
  });
});

describe('gmtOffsetLabel', () => {
  it('renders GMT labels', () => {
    expect(gmtOffsetLabel('UTC', new Date('2026-01-15T00:00:00Z'))).toBe('GMT');
    expect(gmtOffsetLabel('Europe/Paris', new Date('2026-01-15T00:00:00Z'))).toBe('GMT+01:00');
    expect(gmtOffsetLabel('Europe/Paris', new Date('2026-07-15T00:00:00Z'))).toBe('GMT+02:00');
    expect(gmtOffsetLabel('America/New_York', new Date('2026-01-15T00:00:00Z'))).toBe('GMT-05:00');
  });
});

describe('vtimezoneLines', () => {
  it('rejects invalid zones', () => {
    expect(vtimezoneLines('Not/AZone')).toEqual([]);
    expect(vtimezoneLines('')).toEqual([]);
  });

  it('emits a single STANDARD observance for zones without DST', () => {
    const lines = vtimezoneLines('UTC', new Date('2026-06-01T00:00:00Z'));
    expect(lines).toContain('BEGIN:VTIMEZONE');
    expect(lines).toContain('TZID:UTC');
    expect(lines).toContain('BEGIN:STANDARD');
    expect(lines).not.toContain('BEGIN:DAYLIGHT');
    expect(lines).toContain('TZOFFSETTO:+0000');
    expect(lines).toContain('END:VTIMEZONE');
  });

  it('emits STANDARD and DAYLIGHT observances for Europe/Paris', () => {
    const lines = vtimezoneLines('Europe/Paris', new Date('2026-06-01T00:00:00Z'));
    expect(lines).toContain('TZID:Europe/Paris');
    expect(lines).toContain('X-LIC-LOCATION:Europe/Paris');
    expect(lines).toContain('BEGIN:STANDARD');
    expect(lines).toContain('BEGIN:DAYLIGHT');
    expect(lines).toContain('TZOFFSETTO:+0100');
    expect(lines).toContain('TZOFFSETTO:+0200');
    // EU transitions happen at 01:00 UTC → 02:00 wall before spring forward,
    // 03:00 wall before fall back.
    const daylight = observanceBlocks(lines, 'DAYLIGHT');
    expect(daylight.join('\n')).toContain('T020000');
    const standard = observanceBlocks(lines, 'STANDARD');
    expect(standard.join('\n')).toContain('T030000');
  });

  it('produces a VTIMEZONE ical.js resolves to the same instants as Intl', () => {
    const tzid = 'Europe/Paris';
    const lines = vtimezoneLines(tzid, new Date('2026-06-01T00:00:00Z'));
    const zone = zoneFromLines(lines, tzid);

    // Winter (CET +1) and summer (CEST +2) wall times must resolve identically.
    for (const wall of ['2026-01-15T12:00:00', '2026-08-01T15:30:00', '2027-03-10T09:45:00']) {
      const d = new Date(`${wall}Z`); // wall components only
      const expected = zonedWallTimeToUtc(
        d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
        d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
        tzid,
      ).getTime();
      expect(utcAt(zone, wall)).toBe(expected);
    }
  });

  it('handles southern-hemisphere DST (transitions at year boundaries)', () => {
    const tzid = 'Australia/Sydney';
    const lines = vtimezoneLines(tzid, new Date('2026-06-01T00:00:00Z'));
    const zone = zoneFromLines(lines, tzid);
    const wall = '2026-01-15T10:00:00';
    const d = new Date(`${wall}Z`);
    const expected = zonedWallTimeToUtc(
      d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(),
      d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
      tzid,
    ).getTime();
    expect(utcAt(zone, wall)).toBe(expected);
  });
});
