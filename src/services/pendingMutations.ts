import { useSyncExternalStore } from 'react';
import { storage } from '@/storage';
import type { Account, CalendarMeta } from '@/types';
import { putEvent, updateEvent, deleteEvent, moveEvent } from '@/services/nextcloud/caldav';
import { HttpError } from '@/services/shared/errors';
import { getIsOnline } from '@/services/shared/network';

const KEY = 'pendingMutations.v1';
const MAX_TRIES = 10;

export type PendingOp =
    | { id: string; kind: 'create'; accountId: string; calendar: CalendarMeta; uid: string; ics: string; tries: number; createdAt: number }
    | { id: string; kind: 'update'; accountId: string; href: string; ics: string; tries: number; createdAt: number }
    | { id: string; kind: 'delete'; accountId: string; href: string; tries: number; createdAt: number }
    | { id: string; kind: 'move'; accountId: string; fromHref: string; targetCalendar: CalendarMeta; uid: string; tries: number; createdAt: number };

function readQueue(): PendingOp[] {
    try {
        const raw = storage.getString(KEY);
        return raw ? (JSON.parse(raw) as PendingOp[]) : [];
    } catch {
        return [];
    }
}

function writeQueue(ops: PendingOp[]): void {
    if (ops.length) storage.set(KEY, JSON.stringify(ops));
    else storage.remove(KEY);
    listeners.forEach((l) => l());
}

const listeners = new Set<() => void>();
function subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
}
function snapshot(): number {
    return readQueue().length;
}

/** True when the error is a transport failure (no HTTP response) — worth
 * queueing for replay. HTTP errors are server verdicts: don't retry them. */
export function isNetworkFailure(error: unknown): boolean {
    return !(error instanceof HttpError);
}

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

export function enqueue(op: DistributiveOmit<PendingOp, 'id' | 'tries' | 'createdAt'>): void {
    const queue = readQueue();
    queue.push({ ...op, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, tries: 0, createdAt: Date.now() } as PendingOp);
    writeQueue(queue);
}

export function pendingCount(): number {
    return readQueue().length;
}

export function usePendingCount(): number {
    return useSyncExternalStore(subscribe, snapshot, snapshot);
}

let draining = false;

/** Replay queued mutations for `account`, in order. An op that still fails
 * stays queued (tries++) unless it exceeds MAX_TRIES, then it is dropped —
 * the local optimistic state was already applied at enqueue time. */
export async function drainPending(account: Account): Promise<number> {
    if (draining || !getIsOnline()) return 0;
    draining = true;
    let flushed = 0;
    try {
        for (;;) {
            const queue = readQueue();
            const op = queue.find((o) => o.accountId === account.id);
            if (!op) break;
            try {
                if (op.kind === 'create') await putEvent(account, op.calendar, op.uid, op.ics);
                else if (op.kind === 'update') await updateEvent(account, op.href, op.ics);
                else if (op.kind === 'delete') await deleteEvent(account, op.href);
                else await moveEvent(account, op.fromHref, op.targetCalendar, op.uid);
                writeQueue(queue.filter((o) => o.id !== op.id));
                flushed++;
            } catch (error) {
                if (isNetworkFailure(error) && op.tries + 1 < MAX_TRIES) {
                    writeQueue(queue.map((o) => (o.id === op.id ? { ...o, tries: o.tries + 1 } : o)));
                    break; // still offline — stop the loop, retry on next online transition
                }
                // HTTP verdict or exhausted: drop, local state stays as the user saw it
                writeQueue(queue.filter((o) => o.id !== op.id));
            }
        }
    } finally {
        draining = false;
    }
    return flushed;
}
