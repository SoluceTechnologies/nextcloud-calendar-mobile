import { deleteEvent } from '../../src/api/caldav';
import type { Account } from '../../src/types';

const account: Account = {
  id: 'acc-1',
  displayName: 'Work',
  baseUrl: 'https://cloud.example.com',
  username: 'john',
  appPassword: 'xxxx',
  davUserId: 'john',
};

const mockFetch = jest.fn();
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('deleteEvent', () => {
  it('sends DELETE to the given href', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    await deleteEvent(account, 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('treats 404 as success (already deleted)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 404 });
    await expect(
      deleteEvent(account, 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics')
    ).resolves.toBeUndefined();
  });

  it('throws on other error status', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });
    await expect(
      deleteEvent(account, 'https://cloud.example.com/remote.php/dav/calendars/john/personal/uid-abc.ics')
    ).rejects.toThrow('deleteEvent HTTP 500');
  });
});
