import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useDeleteEvent } from '../../src/hooks/useMutateEvent';
import * as caldav from '../../src/api/caldav';
import type { Account, CalendarEvent } from '../../src/types';

jest.mock('../../src/api/caldav');
jest.mock('expo-crypto', () => ({ randomUUID: () => 'mock-uuid-123' }));
const mockDeleteEvent = caldav.deleteEvent as jest.MockedFunction<typeof caldav.deleteEvent>;

const account: Account = {
  id: 'acc-1', displayName: 'Work', baseUrl: 'https://cloud.example.com',
  username: 'john', appPassword: 'xxxx', davUserId: 'john',
};

const event: CalendarEvent = {
  uid: 'uid-abc',
  href: 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics',
  calendarId: 'cal-url',
  accountId: 'acc-1',
  summary: 'Test',
  dtstart: new Date('2026-06-01T14:00:00Z'),
  dtend: new Date('2026-06-01T15:00:00Z'),
  allDay: false,
  color: '#0082c9',
  attendees: [],
  isRecurring: false,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('useDeleteEvent', () => {
  it('calls deleteEvent with account and event href on mutate', async () => {
    mockDeleteEvent.mockResolvedValue();
    const { result } = renderHook(() => useDeleteEvent(account), { wrapper });
    await act(async () => { result.current.mutate(event); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockDeleteEvent).toHaveBeenCalledWith(account, event.href);
  });
});
