import { useSyncExternalStore } from 'react';
import * as Network from 'expo-network';

let online = true;
const listeners = new Set<() => void>();

function isOnlineState(state: Network.NetworkState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

function set(value: boolean): void {
  if (value === online) return;
  online = value;
  listeners.forEach((l) => l());
}

export function setupOnlineManager(): () => void {
  Network.getNetworkStateAsync()
    .then((state) => set(isOnlineState(state)))
    .catch(() => undefined);
  const sub = Network.addNetworkStateListener((state) => set(isOnlineState(state)));
  return () => sub.remove();
}

export function getIsOnline(): boolean {
  return online;
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => online,
    () => true,
  );
}
