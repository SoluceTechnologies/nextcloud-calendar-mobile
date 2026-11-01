import {
  dayEventsToPrompt,
  draftDescriptionPrompt,
} from '@/features/ai/prompts';
import type { SummaryEventInput } from '@/features/ai/prompts';

jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(),
  getLocales: jest.fn(),
}));

const { getCalendars, getLocales } = jest.requireMock('expo-localization') as {
  getCalendars: jest.Mock;
  getLocales: jest.Mock;
};

const timed = (over: Partial<SummaryEventInput> = {}): SummaryEventInput => ({
  summary: 'Standup',
  start: '2026-03-12T09:30:00',
  end: '2026-03-12T10:00:00',
  ...over,
});

describe('dayEventsToPrompt', () => {
  beforeEach(() => {
    getCalendars.mockReturnValue([{ uses24hourClock: true }]);
    getLocales.mockReturnValue([{ languageTag: 'en-US' }]);
  });

  it('is instruction-first and serializes a timed event', () => {
    const out = dayEventsToPrompt([timed({ location: 'Room 1' })], {});
    const lines = out.split('\n');
    expect(lines[0]).toContain('Summarize');
    expect(lines).toContain('- 09:30–10:00 · Standup · Room 1');
  });

  it('marks all-day events without times', () => {
    const out = dayEventsToPrompt([{ summary: 'Conf', isAllDay: true }], {});
    expect(out).toContain('- all-day · Conf');
  });

  it('marks tasks and accepts raw CalendarEvent fields', () => {
    const out = dayEventsToPrompt(
      [
        {
          summary: 'Buy milk',
          isTask: true,
          dtstart: new Date(2026, 2, 12, 18, 0),
          dtend: new Date(2026, 2, 12, 18, 15),
          allDay: false,
        },
      ],
      {},
    );
    expect(out).toContain('- [task] 18:00–18:15 · Buy milk');
  });

  it('honors maxEvents truncation', () => {
    const events = Array.from({ length: 5 }, (_, i) => timed({ summary: `E${i}` }));
    const out = dayEventsToPrompt(events, { maxEvents: 3 });
    expect(out).toContain('E0');
    expect(out).toContain('E2');
    expect(out).not.toContain('E3');
    expect(out).toContain('… and 2 more');
  });

  it('handles an empty day', () => {
    expect(dayEventsToPrompt([], {})).toContain('No events.');
  });

  it('uses 12h format when the locale prefers it', () => {
    getCalendars.mockReturnValue([{ uses24hourClock: false }]);
    const out = dayEventsToPrompt([timed()], { locale: 'en-US' });
    expect(out).toContain('9:30 AM');
  });

  it('never leaks descriptions or attendee names (privacy)', () => {
    const events = [
      {
        summary: 'Standup',
        start: '2026-03-12T09:30:00',
        end: '2026-03-12T10:00:00',
        description: 'TOPSECRET_DESCRIPTION',
        attendees: [{ displayName: 'Alice Wonderland', email: 'alice@secret.io' }],
      },
    ] as unknown as SummaryEventInput[];
    const out = dayEventsToPrompt(events, {});
    expect(out).not.toContain('TOPSECRET_DESCRIPTION');
    expect(out).not.toContain('Alice');
    expect(out).not.toContain('secret.io');
    expect(out).not.toMatch(/description|attendee/i);
  });

  it('mentions the reply locale when provided', () => {
    expect(dayEventsToPrompt([timed()], { locale: 'fr-FR' })).toContain('"fr-FR"');
  });
});

describe('draftDescriptionPrompt', () => {
  it('includes title, times, location and states the constraints', () => {
    const out = draftDescriptionPrompt({
      summary: 'Dentist',
      start: '2026-03-12T14:00:00',
      end: '2026-03-12T14:30:00',
      location: 'Clinic',
    });
    expect(out).toContain('Title: Dentist');
    expect(out).toContain('Start: 2026-03-12 14:00');
    expect(out).toContain('End: 2026-03-12 14:30');
    expect(out).toContain('Location: Clinic');
    expect(out).toMatch(/same language/i);
    expect(out).toMatch(/do not invent/i);
  });

  it('omits optional lines when absent', () => {
    const out = draftDescriptionPrompt({ summary: 'Call' });
    expect(out).not.toContain('Start:');
    expect(out).not.toContain('End:');
    expect(out).not.toContain('Location:');
  });
});
