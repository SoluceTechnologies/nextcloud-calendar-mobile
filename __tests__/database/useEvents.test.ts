import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Subject } from 'rxjs';

import { useEventsForRange } from '@/database/useEvents';
import { useDatabase } from '@/database/DatabaseProvider';

jest.mock('@/database/DatabaseProvider', () => ({
  useDatabase: jest.fn(),
}));

function makeRow(
  id: string,
  startMs: number,
  endMs: number,
  summary = 'Event',
) {
  return {
    id,
    accountId: 'a1',
    calendarId: 'c1',
    uid: id,
    href: `/${id}.ics`,
    summary,
    description: undefined,
    location: undefined,
    start: startMs,
    end: endMs,
    allDay: false,
    color: '#0082c9',
    attendees: undefined,
    organizerEmail: undefined,
    talkUrl: undefined,
    isRecurring: false,
    rrule: undefined,
    recurrenceId: undefined,
    alarmMinutes: undefined,
    isTask: false,
  };
}

describe('useEventsForRange', () => {
  let eventsSubject: Subject<unknown[]>;
  let mockDatabase: { get: jest.Mock };

  beforeEach(() => {
    eventsSubject = new Subject<unknown[]>();
    const mockCollection = {
      query: jest.fn(() => ({
        observeWithColumns: jest.fn(() => eventsSubject.asObservable()),
      })),
    };
    mockDatabase = { get: jest.fn(() => mockCollection) };
    (useDatabase as jest.Mock).mockReturnValue(mockDatabase);
  });

  it('maps events on first emission', async () => {
    const start = new Date('2026-08-25T08:00:00.000Z');
    const end = new Date('2026-08-25T20:00:00.000Z');
    const { result } = renderHook(() => useEventsForRange('a1', start, end));
    const row = makeRow(
      'e1',
      Date.parse('2026-08-25T10:00:00.000Z'),
      Date.parse('2026-08-25T11:00:00.000Z'),
      'Drag Test',
    );

    act(() => { eventsSubject.next([row]); });

    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].summary).toBe('Drag Test');
    expect(result.current[0].dtstart).toEqual(
      new Date('2026-08-25T10:00:00.000Z'),
    );
  });

  it('updates when the same row instance is re-emitted with changed start/end', async () => {
    const start = new Date('2026-08-25T08:00:00.000Z');
    const end = new Date('2026-08-25T20:00:00.000Z');
    const { result } = renderHook(() => useEventsForRange('a1', start, end));
    const row = makeRow(
      'e1',
      Date.parse('2026-08-25T10:00:00.000Z'),
      Date.parse('2026-08-25T11:00:00.000Z'),
    );

    act(() => { eventsSubject.next([row]); });
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].dtstart).toEqual(
      new Date('2026-08-25T10:00:00.000Z'),
    );

    // WatermelonDB can re-use the same model instance; only the start/end
    // values changed, which is exactly what happens after a drag-and-drop.
    row.start = Date.parse('2026-08-25T12:00:00.000Z');
    row.end = Date.parse('2026-08-25T13:00:00.000Z');
    act(() => { eventsSubject.next([row]); });

    await waitFor(() => expect(result.current[0].dtstart).toEqual(
      new Date('2026-08-25T12:00:00.000Z'),
    ));
  });

  it('updates when only the summary changes and start/end stay the same', async () => {
    const start = new Date('2026-08-25T08:00:00.000Z');
    const end = new Date('2026-08-25T20:00:00.000Z');
    const { result } = renderHook(() => useEventsForRange('a1', start, end));
    const row = makeRow(
      'e1',
      Date.parse('2026-08-25T10:00:00.000Z'),
      Date.parse('2026-08-25T11:00:00.000Z'),
      'Old title',
    );

    act(() => { eventsSubject.next([row]); });
    await waitFor(() => expect(result.current[0].summary).toBe('Old title'));

    row.summary = 'New title';
    act(() => { eventsSubject.next([row]); });

    await waitFor(() => expect(result.current[0].summary).toBe('New title'));
  });
});
