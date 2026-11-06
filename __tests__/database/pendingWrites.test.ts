import { markPending, pendingKeys, releasePending } from '../../src/database/pendingWrites';
import { storage } from '../../src/storage';

const k = (uid: string) => `acc-1|cal-1|${uid}`;

describe('pendingWrites', () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it('returns an empty set when nothing was written', () => {
    expect(pendingKeys().size).toBe(0);
  });

  it('marks keys as pending and releases them', () => {
    markPending([k('a'), k('b')]);
    expect(pendingKeys()).toEqual(new Set([k('a'), k('b')]));

    releasePending([k('a'), k('b')]);
    expect(pendingKeys().size).toBe(0);
  });

  it('keeps a key pending until its refcount reaches zero', () => {
    // Two mutations touched the same key; the first push has not resolved yet.
    markPending([k('a')]);
    markPending([k('a')]);

    releasePending([k('a')]);
    expect(pendingKeys().has(k('a'))).toBe(true);

    releasePending([k('a')]);
    expect(pendingKeys().has(k('a'))).toBe(false);
  });

  it('persists across simulated restarts (storage survives process state)', () => {
    // A local write orphaned by a crash: marked, never released.
    markPending([k('orphan')]);

    // The next "session" reads the same persisted set.
    expect(pendingKeys().has(k('orphan'))).toBe(true);
  });

  it('ignores releases for keys that are not pending', () => {
    releasePending([k('unknown')]);
    expect(pendingKeys().size).toBe(0);
  });

  it('releases only the keys it is given', () => {
    markPending([k('a'), k('b'), k('c')]);
    releasePending([k('b')]);
    expect(pendingKeys()).toEqual(new Set([k('a'), k('c')]));
  });

  it('recovers from a corrupted payload', () => {
    storage.set('pending_local_writes', '{not json');
    expect(pendingKeys().size).toBe(0);

    markPending([k('a')]);
    expect(pendingKeys().has(k('a'))).toBe(true);
  });
});
