import {
  enabledAccounts,
  isAccountEnabled,
  isLastEnabledAccount,
  nextActiveAccountId,
} from '@/features/account/utils/account';

const a = (id: string) => ({ id });

describe('multi-account helpers', () => {
  const accounts = [a('a1'), a('a2'), a('a3')];

  it('enabledAccounts filters out disabled ids', () => {
    expect(enabledAccounts(accounts, ['a2']).map((x) => x.id)).toEqual(['a1', 'a3']);
    expect(enabledAccounts(accounts, [])).toHaveLength(3);
    expect(enabledAccounts(accounts, ['a1', 'a2', 'a3'])).toEqual([]);
  });

  it('isAccountEnabled mirrors the disabled list', () => {
    expect(isAccountEnabled('a1', ['a2'])).toBe(true);
    expect(isAccountEnabled('a2', ['a2'])).toBe(false);
  });

  it('isLastEnabledAccount is true only for the sole enabled account', () => {
    expect(isLastEnabledAccount('a1', accounts, [])).toBe(false);
    expect(isLastEnabledAccount('a1', accounts, ['a2', 'a3'])).toBe(true);
    expect(isLastEnabledAccount('a2', accounts, ['a2', 'a3'])).toBe(false);
  });

  it('nextActiveAccountId promotes the first enabled account', () => {
    expect(nextActiveAccountId(accounts, [])).toBe('a1');
    expect(nextActiveAccountId(accounts, ['a1'])).toBe('a2');
    expect(nextActiveAccountId(accounts, ['a1', 'a2'])).toBe('a3');
    expect(nextActiveAccountId(accounts, ['a1', 'a2', 'a3'])).toBeNull();
  });
});
