import { formatHour, formatTime, resolveUse24h } from '@/utils/timeFormat';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(),
  getLocales: jest.fn(),
}));

const { getCalendars, getLocales } = jest.requireMock('expo-localization') as {
  getCalendars: jest.Mock;
  getLocales: jest.Mock;
};

function mockSystem(uses24hourClock: boolean | null, languageTag = 'en-US') {
  getCalendars.mockReturnValue([{ uses24hourClock }]);
  getLocales.mockReturnValue([{ languageTag }]);
}

describe('resolveUse24h', () => {
  it('returns true for explicit 24h regardless of system', () => {
    mockSystem(false);
    expect(resolveUse24h('24h')).toBe(true);
  });

  it('returns false for explicit 12h regardless of system', () => {
    mockSystem(true);
    expect(resolveUse24h('12h')).toBe(false);
  });

  it('auto follows the system 24-hour clock setting', () => {
    mockSystem(true);
    expect(resolveUse24h('auto')).toBe(true);
    mockSystem(false);
    expect(resolveUse24h('auto')).toBe(false);
  });

  it('auto falls back to the locale when the system cannot report', () => {
    mockSystem(null, 'fr-FR');
    expect(resolveUse24h('auto')).toBe(true);
    mockSystem(null, 'en-US');
    expect(resolveUse24h('auto')).toBe(false);
  });

  it('auto follows the device locale over the app locale', () => {
    mockSystem(null, 'en-GB');
    expect(resolveUse24h('auto', 'en')).toBe(true);
    mockSystem(null, 'en-US');
    expect(resolveUse24h('auto', 'de')).toBe(false);
  });

  it('auto falls back to the app locale when the device locale is unavailable', () => {
    mockSystem(null, 'en-US');
    getLocales.mockReturnValue([]);
    expect(resolveUse24h('auto', 'de-DE')).toBe(true);
  });
});

describe('formatTime', () => {
  const afternoon = new Date(2026, 8, 18, 14, 30);
  const pastMidnight = new Date(2026, 8, 18, 0, 5);

  it('formats 24h with a zero-padded hour', () => {
    expect(formatTime(afternoon, true)).toBe('14:30');
    expect(formatTime(pastMidnight, true)).toBe('00:05');
  });

  it('formats 12h', () => {
    expect(formatTime(afternoon, false)).toBe('2:30 PM');
    expect(formatTime(pastMidnight, false)).toBe('12:05 AM');
  });
});

describe('formatHour', () => {
  it('formats 24h as HH:00', () => {
    expect(formatHour(0, true)).toBe('00:00');
    expect(formatHour(9, true)).toBe('09:00');
    expect(formatHour(13, true)).toBe('13:00');
    expect(formatHour(23, true)).toBe('23:00');
  });

  it('formats 12h as AM/PM', () => {
    expect(formatHour(0, false)).toBe('12 AM');
    expect(formatHour(9, false)).toBe('9 AM');
    expect(formatHour(12, false)).toBe('12 PM');
    expect(formatHour(13, false)).toBe('1 PM');
    expect(formatHour(23, false)).toBe('11 PM');
  });
});
