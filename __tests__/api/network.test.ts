import * as Network from 'expo-network';
import { setupOnlineManager, getIsOnline } from '../../src/services/shared/network';

jest.mock('expo-network', () => ({
  __esModule: true,
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
  getNetworkStateAsync: jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  ),
}));

const addNetworkStateListener = Network.addNetworkStateListener as unknown as jest.Mock;

function lastNetworkCallback(): (state: any) => void {
  const calls = addNetworkStateListener.mock.calls;
  return calls[calls.length - 1][0];
}

describe('setupOnlineManager', () => {
  afterEach(() => {
    addNetworkStateListener.mockClear();
  });

  it('reports online when connected and the internet is reachable', () => {
    setupOnlineManager();
    lastNetworkCallback()({ isConnected: true, isInternetReachable: true });
    expect(getIsOnline()).toBe(true);
  });

  it('reports offline when not connected', () => {
    setupOnlineManager();
    lastNetworkCallback()({ isConnected: false, isInternetReachable: false });
    expect(getIsOnline()).toBe(false);
  });

  it('reports offline when connected but the internet is unreachable', () => {
    setupOnlineManager();
    lastNetworkCallback()({ isConnected: true, isInternetReachable: false });
    expect(getIsOnline()).toBe(false);
  });

  it('treats unknown reachability (undefined) as online', () => {
    setupOnlineManager();
    lastNetworkCallback()({ isConnected: false, isInternetReachable: false });
    lastNetworkCallback()({ isConnected: true });
    expect(getIsOnline()).toBe(true);
  });
});
