import { resolveFrozenProps } from '../../../src/features/calendar/utils/resolveFrozenProps';

describe('resolveFrozenProps', () => {
  it('uses live props and advances frozen when visible', () => {
    const live = { events: [1] };
    const frozen = { events: [0] };
    const r = resolveFrozenProps(true, live, frozen);
    expect(r.props).toBe(live);
    expect(r.nextFrozen).toBe(live);
  });

  it('keeps frozen props (same reference) and ignores live when hidden', () => {
    const live = { events: [1] };
    const frozen = { events: [0] };
    const r = resolveFrozenProps(false, live, frozen);
    expect(r.props).toBe(frozen);
    expect(r.nextFrozen).toBe(frozen);
  });
});
