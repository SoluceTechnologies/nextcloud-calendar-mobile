import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useFreeBusy } from '@/features/event/hooks/useFreeBusy';
import type { Account, Attendee } from '@/types';

jest.mock('@/services/nextcloud/freeBusy', () => ({
  fetchFreeBusy: jest.fn(),
}));

import { fetchFreeBusy } from '@/services/nextcloud/freeBusy';

const mockedFetchFreeBusy = fetchFreeBusy as jest.MockedFunction<typeof fetchFreeBusy>;

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const organizer: Attendee = { email: 'john@example.com', displayName: 'John' };
const attendees: Attendee[] = [
  { email: 'testuser@example.local', displayName: 'Testuser' },
  { email: 'bob@example.local', displayName: 'Bob' },
];

const start = new Date('2026-08-26T12:00:00Z');
const end = new Date('2026-08-26T13:00:00Z');

function slot(startIso: string, endIso: string, attendees?: string[]) {
  return {
    start: new Date(startIso),
    end: new Date(endIso),
    fbType: 'BUSY' as const,
    attendees,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it('recalculates mergedBusy when an attendee is toggled off in permissive mode', async () => {
  mockedFetchFreeBusy.mockResolvedValue([
    {
      email: 'testuser@example.local',
      displayName: 'Testuser',
      slots: [slot('2026-08-26T12:00:00Z', '2026-08-26T13:00:00Z', ['testuser@example.local'])],
      available: true,
      color: '#E53935',
    },
    {
      email: 'bob@example.local',
      displayName: 'Bob',
      slots: [slot('2026-08-26T13:00:00Z', '2026-08-26T14:00:00Z', ['bob@example.local'])],
      available: true,
      color: '#1E88E5',
    },
  ]);

  const { result, rerender } = renderHook(
    ({ requiredAttendees }: { requiredAttendees: string[] }) =>
      useFreeBusy({
        account,
        organizer,
        attendees,
        start,
        end,
        enabled: true,
        mode: 'permissive',
        requiredAttendees,
      }),
    { initialProps: { requiredAttendees: attendees.map((a) => a.email.toLowerCase()) } },
  );

  await waitFor(() => expect(result.current.mergedBusy.length).toBeGreaterThan(0));

  expect(result.current.mergedBusy).toHaveLength(1);
  expect(result.current.mergedBusy[0].attendees?.sort()).toEqual([
    'bob@example.local',
    'testuser@example.local',
  ]);

  rerender({ requiredAttendees: ['testuser@example.local'] });

  await waitFor(() =>
    expect(result.current.mergedBusy[0].attendees).toEqual(['testuser@example.local']),
  );
});
