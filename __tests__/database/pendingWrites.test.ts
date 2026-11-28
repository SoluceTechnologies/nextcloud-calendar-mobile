import { markPending, pendingKeys, releasePending } from '../../src/database/pendingWrites';

const key = (uid: string) => `acc-1|cal-1|${uid}`;

describe('pendingWrites', () => {
  afterEach(() => {
    while (pendingKeys().size > 0) releasePending([...pendingKeys()]);
  });

  it('returns an empty set when nothing was written', () => {
    expect(pendingKeys().size).toBe(0);
  });

  it('marks keys as pending and releases them', () => {
    markPending([key('a'), key('b')]);
    expect(pendingKeys()).toEqual(new Set([key('a'), key('b')]));

    releasePending([key('a'), key('b')]);
    expect(pendingKeys().size).toBe(0);
  });

  it('keeps a key pending until its refcount reaches zero', () => {
    markPending([key('a')]);
    markPending([key('a')]);

    releasePending([key('a')]);
    expect(pendingKeys().has(key('a'))).toBe(true);

    releasePending([key('a')]);
    expect(pendingKeys().has(key('a'))).toBe(false);
  });

  it('starts empty in a new process, so an orphaned write never blocks sync forever', () => {
    markPending([key('orphan')]);
    jest.isolateModules(() => {
      const fresh = require('../../src/database/pendingWrites') as typeof import('../../src/database/pendingWrites');
      expect(fresh.pendingKeys().size).toBe(0);
    });
  });

  it('ignores releases for keys that are not pending', () => {
    releasePending([key('unknown')]);
    expect(pendingKeys().size).toBe(0);
  });

  it('releases only the keys it is given', () => {
    markPending([key('a'), key('b'), key('c')]);
    releasePending([key('b')]);
    expect(pendingKeys()).toEqual(new Set([key('a'), key('c')]));
  });
});
