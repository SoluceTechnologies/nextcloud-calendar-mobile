jest.mock('@/services/nextcloud/caldav', () => ({
    putEvent: jest.fn(),
    updateEvent: jest.fn(),
    deleteEvent: jest.fn(),
    moveEvent: jest.fn(),
}));

jest.mock('@/services/shared/network', () => ({
    getIsOnline: jest.fn(() => true),
}));

const mockStore = new Map<string, string>();
jest.mock('@/storage', () => ({
    storage: {
        getString: (k: string) => mockStore.get(k),
        set: (k: string, v: string) => mockStore.set(k, v),
        remove: (k: string) => mockStore.delete(k),
    },
}));

import { enqueue, drainPending, pendingCount, isNetworkFailure } from '@/services/pendingMutations';
import { putEvent, deleteEvent } from '@/services/nextcloud/caldav';
import { HttpError } from '@/services/shared/errors';
import type { Account, CalendarMeta } from '@/types';

const account = { id: 'acc1' } as Account;
const cal = { id: 'cal1', url: 'https://x/dav/personal/' } as CalendarMeta;

describe('pendingMutations outbox', () => {
    beforeEach(() => {
        mockStore.clear();
        jest.clearAllMocks();
    });

    it('isNetworkFailure: HTTP errors are not retried, transport errors are', () => {
        expect(isNetworkFailure(new HttpError(403, 'x'))).toBe(false);
        expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true);
    });

    it('enqueue → drain replays a create PUT and empties the queue', async () => {
        enqueue({ kind: 'create', accountId: 'acc1', calendar: cal, uid: 'u1', ics: 'ICS' });
        expect(pendingCount()).toBe(1);
        const flushed = await drainPending(account);
        expect(flushed).toBe(1);
        expect(putEvent).toHaveBeenCalledWith(account, cal, 'u1', 'ICS');
        expect(pendingCount()).toBe(0);
    });

    it('a failed replay stays queued with tries++ and stops the loop', async () => {
        (deleteEvent as jest.Mock).mockRejectedValue(new TypeError('Network request failed'));
        enqueue({ kind: 'delete', accountId: 'acc1', href: 'https://x/e.ics' });
        await drainPending(account);
        expect(pendingCount()).toBe(1);
    });

    it('an HTTP-verdict failure drops the op (server answered)', async () => {
        (deleteEvent as jest.Mock).mockRejectedValue(new HttpError(404, 'deleteEvent'));
        enqueue({ kind: 'delete', accountId: 'acc1', href: 'https://x/e.ics' });
        await drainPending(account);
        expect(pendingCount()).toBe(0);
    });

    it('ops of other accounts are left untouched', async () => {
        enqueue({ kind: 'create', accountId: 'other', calendar: cal, uid: 'u2', ics: 'X' });
        await drainPending(account);
        expect(putEvent).not.toHaveBeenCalled();
        expect(pendingCount()).toBe(1);
    });
});
