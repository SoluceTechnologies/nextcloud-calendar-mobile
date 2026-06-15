import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import React from 'react';
import { createQueryClient } from '../../src/api/queryClient';
import { useCreateEvent, useUpdateEvent, useDeleteEvent } from '../../src/hooks/useMutateEvent';
import * as caldav from '../../src/api/caldav';
import type { Account, CalendarMeta, CalendarEvent, CreateEventInput } from '../../src/types';

jest.mock('../../src/api/caldav');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid-123' }));

const mockPutEvent = caldav.putEvent as jest.MockedFunction<typeof caldav.putEvent>;
const mockUpdateEvent = caldav.updateEvent as jest.MockedFunction<typeof caldav.updateEvent>;
const mockDeleteEvent = caldav.deleteEvent as jest.MockedFunction<typeof caldav.deleteEvent>;

const account: Account = {
  id: 'acc-1', displayName: 'Work', baseUrl: 'https://cloud.example.com',
  username: 'john', appPassword: 'xxxx', davUserId: 'john',
};

const calendar: CalendarMeta = {
  id: 'cal-url', accountId: 'acc-1', displayName: 'Personal', color: '#0082c9',
  ctag: '1', url: 'https://cloud.example.com/remote.php/dav/calendars/john/personal/', slug: 'personal',
};
const calendars = [calendar];

const WINDOW_KEY = ['acc-1', 'events', ['cal-url'], '2026-06-01T00:00:00.000Z', '2026-08-31T23:59:59.000Z'];

const existingEvent: CalendarEvent = {
  uid: 'uid-abc',
  href: 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics',
  calendarId: 'cal-url', accountId: 'acc-1', summary: 'Original',
  dtstart: new Date('2026-06-15T14:00:00Z'), dtend: new Date('2026-06-15T15:00:00Z'),
  allDay: false, color: '#0082c9', attendees: [], isRecurring: false,
};

const createInput: CreateEventInput = {
  summary: 'New Event', calendarId: 'cal-url',
  dtstart: new Date('2026-06-20T10:00:00Z'), dtend: new Date('2026-06-20T11:00:00Z'),
  allDay: false, attendees: [], withTalkRoom: false,
  organizerEmail: 'john@example.com', organizerName: 'John',
};

function setup() {
  const client = createQueryClient();
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

function eventsInCache(client: QueryClient): CalendarEvent[] {
  return (client.getQueryData(WINDOW_KEY) as CalendarEvent[] | undefined) ?? [];
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});

describe('useCreateEvent', () => {
  it('shows the new event before the server responds, then reconciles to the real uid', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, []);
    let resolvePut!: () => void;
    mockPutEvent.mockReturnValue(new Promise<void>((r) => { resolvePut = r; }));

    const { result } = renderHook(() => useCreateEvent(account, calendars), { wrapper });
    act(() => { result.current.mutate(createInput); });

    await waitFor(() => expect(eventsInCache(client)).toHaveLength(1));
    expect(eventsInCache(client)[0].uid).toContain('optimistic-');
    expect(eventsInCache(client)[0].summary).toBe('New Event');

    act(() => { resolvePut(); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eventsInCache(client)).toHaveLength(1);
    expect(eventsInCache(client)[0].uid).toBe('mock-uuid-123');
    expect(mockPutEvent).toHaveBeenCalledTimes(1);
    expect(caldav.fetchEvents).not.toHaveBeenCalled();
  });

  it('normalizes an optimistic all-day event to midnight start AND end', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, []);
    mockPutEvent.mockResolvedValue();

    const allDayInput: CreateEventInput = {
      ...createInput,
      allDay: true,
      dtstart: new Date('2026-06-20T10:00:00Z'),
      dtend: new Date('2026-06-20T11:00:00Z'),
    };

    const { result } = renderHook(() => useCreateEvent(account, calendars), { wrapper });
    act(() => { result.current.mutate(allDayInput); });

    await waitFor(() => expect(eventsInCache(client)).toHaveLength(1));
    const ev = eventsInCache(client)[0];
    expect(ev.allDay).toBe(true);
    expect(ev.dtstart.getHours()).toBe(0);
    expect(ev.dtstart.getMinutes()).toBe(0);
    expect(ev.dtend.getHours()).toBe(0);
    expect(ev.dtend.getMinutes()).toBe(0);
  });

  it('rolls back and alerts when create fails', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, []);
    mockPutEvent.mockRejectedValue(new Error('putEvent HTTP 500'));

    const { result } = renderHook(() => useCreateEvent(account, calendars), { wrapper });
    act(() => { result.current.mutate(createInput); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(eventsInCache(client)).toHaveLength(0);
    expect(Alert.alert).toHaveBeenCalledWith('Failed to create event', expect.any(String));
  });
});

describe('useUpdateEvent', () => {
  it('optimistically patches an edited event and reconciles locally (no refetch)', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, [existingEvent]);
    mockUpdateEvent.mockResolvedValue();

    const { result } = renderHook(() => useUpdateEvent(account, calendars), { wrapper });
    const input: CreateEventInput = { ...createInput, summary: 'Edited' };
    act(() => { result.current.mutate({ event: existingEvent, input }); });

    await waitFor(() => expect(eventsInCache(client)[0].summary).toBe('Edited'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(eventsInCache(client)).toHaveLength(1);
    expect(mockUpdateEvent).toHaveBeenCalledTimes(1);
    expect(caldav.fetchEvents).not.toHaveBeenCalled();
  });

  it('rolls back to the original and alerts when update fails', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, [existingEvent]);
    mockUpdateEvent.mockRejectedValue(new Error('updateEvent HTTP 403'));

    const { result } = renderHook(() => useUpdateEvent(account, calendars), { wrapper });
    const input: CreateEventInput = { ...createInput, summary: 'Edited' };
    act(() => { result.current.mutate({ event: existingEvent, input }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(eventsInCache(client)[0].summary).toBe('Original');
    expect(Alert.alert).toHaveBeenCalledWith('Failed to update event', expect.stringContaining('Permission denied'));
  });
});

describe('useDeleteEvent', () => {
  it('calls deleteEvent with account and event href on mutate', async () => {
    const { wrapper } = setup();
    mockDeleteEvent.mockResolvedValue();
    const { result } = renderHook(() => useDeleteEvent(account), { wrapper });
    await act(async () => { result.current.mutate({ event: existingEvent }); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEvent).toHaveBeenCalledWith(account, existingEvent.href);
  });

  it('optimistically removes the event from the cache', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, [existingEvent]);
    mockDeleteEvent.mockResolvedValue();

    const { result } = renderHook(() => useDeleteEvent(account), { wrapper });
    act(() => { result.current.mutate({ event: existingEvent }); });

    await waitFor(() => expect(eventsInCache(client)).toHaveLength(0));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('restores the event and alerts when delete fails', async () => {
    const { client, wrapper } = setup();
    client.setQueryData(WINDOW_KEY, [existingEvent]);
    mockDeleteEvent.mockRejectedValue(new Error('deleteEvent HTTP 500'));

    const { result } = renderHook(() => useDeleteEvent(account), { wrapper });
    act(() => { result.current.mutate({ event: existingEvent }); });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(eventsInCache(client)).toHaveLength(1);
    expect(eventsInCache(client)[0].uid).toBe('uid-abc');
    expect(Alert.alert).toHaveBeenCalledWith('Failed to delete event', expect.any(String));
  });
});
