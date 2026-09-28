import { decideMoveEventScope } from '@/features/calendar/utils/moveEventScope';

describe('decideMoveEventScope', () => {
  it('commits a non-recurring event with scope "all" and no prompt', () => {
    expect(decideMoveEventScope({ isRecurring: false, rrule: undefined })).toEqual({
      kind: 'commit',
      scope: 'all',
    });
  });

  it('prompts for a recurring event whose rule parses exactly', () => {
    expect(
      decideMoveEventScope({ isRecurring: true, rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO' }),
    ).toEqual({ kind: 'prompt' });
  });

  it('commits with scope "this" and does not prompt when the rule cannot round-trip', () => {
    expect(
      decideMoveEventScope({ isRecurring: true, rrule: 'RRULE:FREQ=MONTHLY;BYMONTHDAY=15' }),
    ).toEqual({ kind: 'commit', scope: 'this' });
  });

  it('commits with scope "this" when a recurring event has no rrule string at all', () => {
    expect(decideMoveEventScope({ isRecurring: true, rrule: undefined })).toEqual({
      kind: 'commit',
      scope: 'this',
    });
  });
});
