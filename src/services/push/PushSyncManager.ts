import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import type { Account } from '@/types';
import { createNotifyPushClient, fetchNotifyPushCapabilities } from './notifyPush';
import type { NotifyPushClient } from './notifyPush';
import type { PushListener, PushMessage } from './types';

export type PushSyncStatus =
  | 'idle'
  | 'checking'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'unsupported';

class PushSyncManager {
  private static instance: PushSyncManager;

  private client: NotifyPushClient | null = null;
  private account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'> | null = null;
  private appState: AppStateStatus = 'active';
  private listeners: PushListener[] = [];
  private status: PushSyncStatus = 'idle';
  private appStateListener: NativeEventSubscription | null = null;
  private removeClientListener: (() => void) | null = null;

  private constructor() {}

  static shared(): PushSyncManager {
    if (!PushSyncManager.instance) {
      PushSyncManager.instance = new PushSyncManager();
    }
    return PushSyncManager.instance;
  }

  getStatus(): PushSyncStatus {
    return this.status;
  }

  addListener(listener: PushListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(message: PushMessage) {
    this.listeners.forEach((l) => {
      try {
        l(message);
      } catch (err) {
        console.warn('[PushSyncManager] listener error:', err);
      }
    });
  }

  private setStatus(status: PushSyncStatus) {
    this.status = status;
  }

  private onMessage = (message: PushMessage) => {
    this.emit(message);
  };

  private onAppStateChange = (nextAppState: AppStateStatus) => {
    const previous = this.appState;
    this.appState = nextAppState;

    // Suspend WebSocket when going to background (keep-alive not reliable on mobile)
    if (nextAppState.match(/inactive|background/)) {
      this.disconnect('disconnected');
    } else if (previous.match(/inactive|background/) && nextAppState === 'active') {
      if (this.account) {
        void this.connect(this.account);
      }
    }
  };

  async connect(account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>): Promise<void> {
    this.account = account;

    if (this.appState.match(/inactive|background/)) {
      this.setStatus('idle');
      return;
    }

    if (this.client) {
      this.client.disconnect();
      this.removeClientListener?.();
    }

    this.setStatus('checking');

    const caps = await fetchNotifyPushCapabilities(account).catch((err) => {
      console.warn('[PushSyncManager] capability fetch failed:', err);
      return undefined;
    });

    if (!caps?.websocketUrl) {
      this.setStatus('unsupported');
      return;
    }

    this.setStatus('connecting');

    this.client = createNotifyPushClient(account, caps.websocketUrl);
    this.removeClientListener = this.client.addListener(this.onMessage);
    this.client.connect();

    // Give the status a short time to settle to connected
    this.watchConnected();
  }

  private watchConnected() {
    const interval = setInterval(() => {
      if (!this.client) {
        clearInterval(interval);
        return;
      }
      const status = this.client.getStatus();
      if (status === 'connected') {
        this.setStatus('connected');
        clearInterval(interval);
      } else if (status === 'error' || status === 'unsupported') {
        this.setStatus('disconnected');
        clearInterval(interval);
      }
    }, 250);

    setTimeout(() => clearInterval(interval), 10000);
  }

  disconnect(finalStatus: PushSyncStatus = 'idle') {
    this.removeClientListener?.();
    this.client?.disconnect();
    this.client = null;
    this.setStatus(finalStatus);
  }

  start() {
    if (this.appStateListener) return;
    this.appStateListener = AppState.addEventListener('change', this.onAppStateChange);
  }

  stop() {
    this.disconnect('idle');
    this.appStateListener?.remove();
    this.appStateListener = null;
  }
}

export const pushSyncManager = PushSyncManager.shared();
