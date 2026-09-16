import { parseRrule } from '@/features/calendar/utils/parseRrule';

describe('parseRrule', () => {
  it('returns undefined for nothing to parse', () => {
    expect(parseRrule(undefined)).toBeUndefined();
    expect(parseRrule('')).toBeUndefined();
  });

  it('reads a bare frequency', () => {
    expect(parseRrule('RRULE:FREQ=WEEKLY')).toEqual({ freq: 'WEEKLY' });
  });

  it('tolerates a missing RRULE: prefix', () => {
    expect(parseRrule('FREQ=DAILY')).toEqual({ freq: 'DAILY' });
  });

  it('is case-insensitive on keys and values', () => {
    expect(parseRrule('rrule:freq=monthly')).toEqual({ freq: 'MONTHLY' });
  });

  it('reads interval, count and byDay', () => {
    expect(parseRrule('RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=10')).toEqual({
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO', 'WE'],
      count: 10,
    });
  });

  it('reads a UTC UNTIL stamp', () => {
    const parsed = parseRrule('RRULE:FREQ=DAILY;UNTIL=20260815T093000Z');
    expect(parsed?.until?.toISOString()).toBe('2026-08-15T09:30:00.000Z');
  });

  it('reads a date-only UNTIL as a local calendar day, like every other all-day date', () => {
    const parsed = parseRrule('RRULE:FREQ=DAILY;UNTIL=20260815');
    expect(parsed?.until).toEqual(new Date(2026, 7, 15));
  });

  it('round-trips every rule the app itself can write', () => {
    const rule = { freq: 'WEEKLY' as const, interval: 3, byDay: ['TU', 'TH'], count: 5 };
    expect(parseRrule('RRULE:FREQ=WEEKLY;INTERVAL=3;BYDAY=TU,TH;COUNT=5')).toEqual(rule);
  });

  it('refuses a rule with parts the type cannot represent', () => {
    expect(parseRrule('RRULE:FREQ=MONTHLY;BYMONTHDAY=15')).toBeUndefined();
    expect(parseRrule('RRULE:FREQ=WEEKLY;WKST=SU')).toBeUndefined();
    expect(parseRrule('RRULE:FREQ=MONTHLY;BYSETPOS=-1;BYDAY=FR')).toBeUndefined();
  });

  it('refuses an unknown or missing frequency', () => {
    expect(parseRrule('RRULE:FREQ=HOURLY')).toBeUndefined();
    expect(parseRrule('RRULE:INTERVAL=2')).toBeUndefined();
  });

  it('refuses a malformed numeric part rather than guessing', () => {
    expect(parseRrule('RRULE:FREQ=DAILY;INTERVAL=abc')).toBeUndefined();
    expect(parseRrule('RRULE:FREQ=DAILY;COUNT=0')).toBeUndefined();
  });

  it('refuses a malformed UNTIL', () => {
    expect(parseRrule('RRULE:FREQ=DAILY;UNTIL=not-a-date')).toBeUndefined();
  });

  it('omits an interval of 1, matching what the writer emits', () => {
    expect(parseRrule('RRULE:FREQ=DAILY;INTERVAL=1')).toEqual({ freq: 'DAILY' });
  });

  it('refuses a rule with both COUNT and UNTIL', () => {
    expect(
      parseRrule('RRULE:FREQ=DAILY;COUNT=5;UNTIL=20260815T093000Z')
    ).toBeUndefined();
  });

  it('refuses a Z-less UNTIL date-time as floating/local, not UTC', () => {
    expect(parseRrule('RRULE:FREQ=DAILY;UNTIL=20260815T093000')).toBeUndefined();
  });

  it('still reads the date-only and Z-suffixed UNTIL forms', () => {
    expect(parseRrule('RRULE:FREQ=DAILY;UNTIL=20260815')?.until).toEqual(new Date(2026, 7, 15));
    expect(
      parseRrule('RRULE:FREQ=DAILY;UNTIL=20260815T093000Z')?.until?.toISOString()
    ).toBe('2026-08-15T09:30:00.000Z');
  });

  it('refuses a duplicate key rather than taking the last value', () => {
    expect(parseRrule('RRULE:FREQ=WEEKLY;FREQ=DAILY')).toBeUndefined();
  });

  describe('advanced recurrence rules', () => {
    it('reads monthly positional BYDAY (3rd Saturday)', () => {
      expect(parseRrule('RRULE:FREQ=MONTHLY;BYDAY=3SA')).toEqual({
        freq: 'MONTHLY',
        byDay: ['3SA'],
      });
    });

    it('reads monthly last weekday BYDAY', () => {
      expect(parseRrule('RRULE:FREQ=MONTHLY;BYDAY=-1SU')).toEqual({
        freq: 'MONTHLY',
        byDay: ['-1SU'],
      });
    });

    it('reads yearly positional BYDAY within a month (3rd Saturday in July)', () => {
      expect(parseRrule('RRULE:FREQ=YEARLY;BYMONTH=7;BYDAY=3SA')).toEqual({
        freq: 'YEARLY',
        byMonth: [7],
        byDay: ['3SA'],
      });
    });

    it('reads yearly BYWEEKNO rule (Sunday of ISO week 31)', () => {
      expect(parseRrule('RRULE:FREQ=YEARLY;BYWEEKNO=31;BYDAY=SU')).toEqual({
        freq: 'YEARLY',
        byWeekNo: [31],
        byDay: ['SU'],
      });
    });

    it('strips positional BYDAY for weekly rules', () => {
      expect(parseRrule('RRULE:FREQ=WEEKLY;BYDAY=1MO,WE')).toEqual({
        freq: 'WEEKLY',
        byDay: ['MO', 'WE'],
      });
    });

    it('rejects out-of-range positions for monthly', () => {
      expect(parseRrule('RRULE:FREQ=MONTHLY;BYDAY=10SA')).toBeUndefined();
      expect(parseRrule('RRULE:FREQ=MONTHLY;BYDAY=0SA')).toBeUndefined();
    });

    it('rejects BYWEEKNO with monthly frequency', () => {
      expect(parseRrule('RRULE:FREQ=MONTHLY;BYWEEKNO=2;BYDAY=MO')).toBeUndefined();
    });

    it('rejects positional BYDAY with BYWEEKNO', () => {
      expect(parseRrule('RRULE:FREQ=YEARLY;BYWEEKNO=31;BYDAY=1SU')).toBeUndefined();
    });

    it('rejects BYMONTH combined with BYWEEKNO', () => {
      expect(parseRrule('RRULE:FREQ=YEARLY;BYMONTH=7;BYWEEKNO=31;BYDAY=SU')).toBeUndefined();
    });

    it('normalises the plus sign in positional BYDAY', () => {
      expect(parseRrule('RRULE:FREQ=MONTHLY;BYDAY=+3SA')).toEqual({
        freq: 'MONTHLY',
        byDay: ['3SA'],
      });
    });
  });
});
