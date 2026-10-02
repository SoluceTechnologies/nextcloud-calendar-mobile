import { normalizeSearchText, searchEvents } from '@/features/search/searchEvents';
import type { CalendarEvent } from '../../../src/types';

const base: CalendarEvent = {
  uid: 'uid-abc',
  href: 'https://cloud.example.com/cal/uid-abc.ics',
  calendarId: 'cal-personal',
  accountId: 'acc-1',
  summary: 'Team standup',
  description: 'Daily sync',
  location: 'Room 1',
  dtstart: new Date('2026-06-15T09:00:00Z'),
  dtend: new Date('2026-06-15T09:30:00Z'),
  allDay: false,
  color: '#0082c9',
  attendees: [{ email: 'alice@example.com', displayName: 'Alice Cooper' }],
  isRecurring: false,
};

function ev(overrides: Partial<CalendarEvent>): CalendarEvent {
  return { ...base, ...overrides };
}

describe('normalizeSearchText', () => {
  it('lowercases and strips diacritics', () => {
    expect(normalizeSearchText('  Réunion Équipe  ')).toBe('reunion equipe');
  });
});

describe('searchEvents', () => {
  const events = [
    ev({ uid: 'a', summary: 'Team standup' }),
    ev({ uid: 'b', summary: 'Dentist', location: '12 rue de la Santé', attendees: [] }),
    ev({ uid: 'c', summary: 'Dinner', description: 'Réunion parents école', attendees: [], dtstart: new Date('2026-07-01T18:00:00Z'), dtend: new Date('2026-07-01T19:00:00Z') }),
  ];

  it('returns nothing for an empty query', () => {
    expect(searchEvents(events, '')).toEqual([]);
    expect(searchEvents(events, '   ')).toEqual([]);
  });

  it('matches on summary, case-insensitive', () => {
    expect(searchEvents(events, 'STANDUP').map((e) => e.uid)).toEqual(['a']);
  });

  it('matches on location', () => {
    expect(searchEvents(events, 'santé').map((e) => e.uid)).toEqual(['b']);
  });

  it('matches on description without diacritics in the query', () => {
    expect(searchEvents(events, 'reunion ecole').map((e) => e.uid)).toEqual(['c']);
  });

  it('matches on attendee email and display name', () => {
    expect(searchEvents(events, 'alice@example.com').map((e) => e.uid)).toEqual(['a']);
    expect(searchEvents(events, 'cooper').map((e) => e.uid)).toEqual(['a']);
  });

  it('requires every whitespace-separated term to match', () => {
    expect(searchEvents(events, 'team standup').map((e) => e.uid)).toEqual(['a']);
    expect(searchEvents(events, 'team dentist')).toEqual([]);
  });

  it('sorts results by start date ascending', () => {
    const unsorted = [
      ev({ uid: 'late', summary: 'x', dtstart: new Date('2026-09-01T09:00:00Z'), dtend: new Date('2026-09-01T10:00:00Z') }),
      ev({ uid: 'early', summary: 'x', dtstart: new Date('2026-01-01T09:00:00Z'), dtend: new Date('2026-01-01T10:00:00Z') }),
    ];
    expect(searchEvents(unsorted, 'x').map((e) => e.uid)).toEqual(['early', 'late']);
  });
});
