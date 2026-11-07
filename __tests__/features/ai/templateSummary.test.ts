import { templateSummary } from '@/features/ai/templateSummary';
import type { SummaryEventInput } from '@/features/ai/prompts';
import i18n from '@/utils/i18n';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(),
  getLocales: jest.fn(),
}));

const { getCalendars, getLocales } = jest.requireMock('expo-localization') as {
  getCalendars: jest.Mock;
  getLocales: jest.Mock;
};

const ev = (over: Partial<SummaryEventInput> = {}): SummaryEventInput => ({
  summary: 'X',
  start: '2026-03-12T09:30:00',
  end: '2026-03-12T10:00:00',
  ...over,
});

describe('templateSummary', () => {
  beforeEach(() => {
    getCalendars.mockReturnValue([{ uses24hourClock: true }]);
    getLocales.mockReturnValue([{ languageTag: 'en-US' }]);
  });

  afterAll(async () => {
    await i18n.changeLanguage('en');
  });

  it('returns an empty string for an empty day', () => {
    expect(templateSummary([], {})).toBe('');
  });

  it('counts events and shows the next timed event with location', () => {
    const out = templateSummary(
      [
        ev({ summary: 'Standup', location: 'Room 1' }),
        ev({ summary: 'Lunch', start: '2026-03-12T12:00:00' }),
      ],
      {},
    );
    expect(out).toBe('2 events · next: Standup at 09:30, Room 1');
  });

  it('counts all-day events but next is the first timed one', () => {
    const out = templateSummary(
      [ev({ summary: 'Conf', isAllDay: true, start: undefined }), ev({ summary: 'Standup' })],
      {},
    );
    expect(out).toBe('2 events · next: Standup at 09:30');
  });

  it('mentions tasks separately', () => {
    const out = templateSummary(
      [
        ev({ summary: 'Standup' }),
        ev({ summary: 'Lunch', start: '2026-03-12T12:00:00' }),
        { summary: 'Buy milk', isTask: true },
      ],
      {},
    );
    expect(out).toBe('2 events · 1 task · next: Standup at 09:30');
  });

  it('only tasks produces no next section', () => {
    expect(
      templateSummary(
        [
          { summary: 'a', isTask: true },
          { summary: 'b', isTask: true },
        ],
        {},
      ),
    ).toBe('2 tasks');
  });

  it('all-day only day has no next section', () => {
    expect(templateSummary([{ summary: 'Conf', isAllDay: true }], {})).toBe('1 event');
  });

  it('picks the earliest timed event regardless of input order', () => {
    const out = templateSummary(
      [
        ev({ summary: 'Late', start: '2026-03-12T15:00:00' }),
        ev({ summary: 'Early', start: '2026-03-12T08:00:00' }),
      ],
      {},
    );
    expect(out).toContain('next: Early at 08:00');
  });

  it('uses 12h format when the locale prefers it', () => {
    getCalendars.mockReturnValue([{ uses24hourClock: false }]);
    expect(templateSummary([ev({ summary: 'Standup' })], { locale: 'en-US' })).toBe(
      '1 event · next: Standup at 9:30 AM',
    );
  });

  it('works with raw CalendarEvent fields', () => {
    const out = templateSummary(
      [{ summary: 'Standup', dtstart: new Date(2026, 2, 12, 9, 30), allDay: false }],
      {},
    );
    expect(out).toBe('1 event · next: Standup at 09:30');
  });
});
