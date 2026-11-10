import { useAccountStore } from '../../src/stores/accountStore';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('accountStore', () => {
  beforeEach(() => {
    useAccountStore.setState({
      activeAccountId: null,
      disabledAccountIds: [],
      capabilities: { talkEnabled: false, calendarApp: 'unknown' },
    });
  });

  it('sets active account id', () => {
    useAccountStore.getState().setActiveAccountId('acc-1');
    expect(useAccountStore.getState().activeAccountId).toBe('acc-1');
  });

  it('clears active account id', () => {
    useAccountStore.getState().setActiveAccountId('acc-1');
    useAccountStore.getState().setActiveAccountId(null);
    expect(useAccountStore.getState().activeAccountId).toBeNull();
  });

  it('sets capabilities', () => {
    useAccountStore.getState().setCapabilities({ talkEnabled: true, calendarApp: 'available' });
    expect(useAccountStore.getState().capabilities.talkEnabled).toBe(true);
  });

  it('disables and re-enables an account', () => {
    const { setAccountDisabled } = useAccountStore.getState();
    setAccountDisabled('acc-1', true);
    expect(useAccountStore.getState().disabledAccountIds).toEqual(['acc-1']);
    setAccountDisabled('acc-1', false);
    expect(useAccountStore.getState().disabledAccountIds).toEqual([]);
  });

  it('does not duplicate ids in disabledAccountIds', () => {
    const { setAccountDisabled } = useAccountStore.getState();
    setAccountDisabled('acc-1', true);
    setAccountDisabled('acc-1', true);
    setAccountDisabled('acc-2', true);
    expect(useAccountStore.getState().disabledAccountIds).toEqual(['acc-1', 'acc-2']);
  });
});
