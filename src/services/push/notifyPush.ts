import type { Account, NotifyPushCapabilities } from '@/types';
import { trustedFetch } from '@/services/shared/trustedFetch';
import type { PushConnectionStatus, PushListener, PushMessage } from './types';

const INITIAL_RETRY_DELAY_MS = 5000;
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export type NotifyPushClient = {
  connect: () => void;
  disconnect: () => void;
  addListener: (listener: PushListener) => () => void;
  removeListener: (listener: PushListener) => void;
  getStatus: () => PushConnectionStatus;
};

export function parseNotifyPushMessage(raw: string): PushMessage | null {
  if (raw === 'authenticated') {
    return { type: 'authenticated', payload: undefined };
  }

  const spaceIdx = raw.indexOf(' ');
  const type: string = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
  const json = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1);

  try {
    const payload = json ? JSON.parse(json) : undefined;
    return { type, payload };
  } catch {
    return { type, payload: undefined };
  }
}

export async function fetchNotifyPushCapabilities(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>,
): Promise<NotifyPushCapabilities | undefined> {
  const url = `${account.baseUrl}/ocs/v2.php/cloud/capabilities`;
  const res = await trustedFetch(url, {
    headers: {
      Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });

  if (!res.ok) return undefined;

  const json = (await res.json()) as {
    ocs?: { data?: { capabilities?: { notify_push?: { type?: string[]; endpoints?: { websocket?: string; pre_auth?: string } } } } };
  };
  const raw = json?.ocs?.data?.capabilities?.notify_push;
  if (!raw?.endpoints?.websocket) return undefined;

  return {
    types: Array.isArray(raw.type) ? raw.type : [],
    websocketUrl: raw.endpoints.websocket,
    preAuthUrl: raw.endpoints.pre_auth,
  };
}

export function createNotifyPushClient(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>,
  wsUrl: string,
): NotifyPushClient {
  let ws: WebSocket | null = null;
  let status: PushConnectionStatus = 'idle';
  let retryDelay = INITIAL_RETRY_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let intentionalClose = false;
  const listeners = new Set<PushListener>();

  function setStatus(next: PushConnectionStatus) {
    status = next;
  }

  function emit(message: PushMessage) {
    listeners.forEach((l) => {
      try {
        l(message);
      } catch (err) {
        console.warn('[notifyPush] listener error:', err);
      }
    });
  }

  function scheduleReconnect() {
    if (intentionalClose) return;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    setStatus('reconnecting');
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
  }

  function connect() {
    if (ws?.readyState === WebSocket.CONNECTING || ws?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    intentionalClose = false;

    // Prefer 127.0.0.1 over localhost for Android emulator, where ::1 won't be
  // captured by adb reverse and hostname resolution can be ambiguous.
  const resolvedUrl = wsUrl.replace(/^ws:\/\/localhost(:\d+)/, 'ws://127.0.0.1$1');

  try {
      ws = new WebSocket(resolvedUrl);
    } catch (err) {
      console.warn('[notifyPush] failed to create WebSocket:', err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      setStatus('auth');
      ws?.send(account.username);
      ws?.send(account.appPassword);
    };

    ws.onmessage = (event: MessageEvent) => {
      const raw = String(event.data ?? '');
      const message = parseNotifyPushMessage(raw);
      if (!message) return;

      if (message.type === 'authenticated') {
        setStatus('connected');
        retryDelay = INITIAL_RETRY_DELAY_MS;
      }

      emit(message);
    };

    ws.onerror = (err: Event) => {
      console.warn('[notifyPush] WebSocket error:', err);
    };

    ws.onclose = () => {
      ws = null;
      setStatus('idle');
      scheduleReconnect();
    };
  }

  function disconnect() {
    intentionalClose = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (ws) {
      try {
        ws.close();
      } catch {
        // ignored
      }
      ws = null;
    }
    setStatus('idle');
  }

  function addListener(listener: PushListener) {
    listeners.add(listener);
    return () => removeListener(listener);
  }

  function removeListener(listener: PushListener) {
    listeners.delete(listener);
  }

  function getStatus() {
    return status;
  }

  return { connect, disconnect, addListener, removeListener, getStatus };
}
