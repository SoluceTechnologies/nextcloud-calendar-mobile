import { trustedFetch } from '@/services/shared/trustedFetch';
import type { Account } from '@/types';

export type OcsNotification = {
  notificationId: number;
  app: string;
  user: string;
  datetime: string;
  objectType: string;
  objectId: string;
  subject: string;
  message: string;
  link: string;
  subjectRich: string;
  subjectRichParameters: Record<string, unknown>;
  messageRich: string;
  messageRichParameters: Record<string, unknown>;
  icon?: string;
  shouldNotify: boolean;
  actions: OcsNotificationAction[];
};

export type OcsNotificationAction = {
  label: string;
  link: string;
  type: 'GET' | 'POST' | 'DELETE';
  primary: boolean;
};

type OcsNotificationsResponse = {
  ocs: {
    data: Record<string, unknown>[];
  };
};

function parseNotification(raw: Record<string, unknown>): OcsNotification {
  return {
    notificationId: Number(raw.notification_id),
    app: String(raw.app ?? ''),
    user: String(raw.user ?? ''),
    datetime: String(raw.datetime ?? ''),
    objectType: String(raw.object_type ?? ''),
    objectId: String(raw.object_id ?? ''),
    subject: String(raw.subject ?? ''),
    message: String(raw.message ?? ''),
    link: String(raw.link ?? ''),
    subjectRich: String(raw.subjectRich ?? ''),
    subjectRichParameters: (raw.subjectRichParameters as Record<string, unknown>) ?? {},
    messageRich: String(raw.messageRich ?? ''),
    messageRichParameters: (raw.messageRichParameters as Record<string, unknown>) ?? {},
    icon: raw.icon ? String(raw.icon) : undefined,
    shouldNotify: Boolean(raw.shouldNotify),
    actions: Array.isArray(raw.actions) ? raw.actions.map(parseAction) : [],
  };
}

function parseAction(raw: unknown): OcsNotificationAction {
  const r = raw as Record<string, unknown>;
  return {
    label: String(r.label ?? ''),
    link: String(r.link ?? ''),
    type: (r.type as 'GET' | 'POST' | 'DELETE') ?? 'GET',
    primary: Boolean(r.primary),
  };
}

export async function fetchNotifications(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>,
): Promise<OcsNotification[]> {
  const url = `${account.baseUrl}/ocs/v2.php/apps/notifications/api/v2/notifications`;
  const res = await trustedFetch(url, {
    headers: {
      Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`[fetchNotifications] HTTP ${res.status}`);
  }

  const json = (await res.json()) as OcsNotificationsResponse;
  return json?.ocs?.data?.map(parseNotification) ?? [];
}

export async function dismissNotification(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>,
  notificationId: number,
): Promise<void> {
  const url = `${account.baseUrl}/ocs/v2.php/apps/notifications/api/v2/notifications/${notificationId}`;
  const res = await trustedFetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`[dismissNotification] HTTP ${res.status}`);
  }
}

export async function dismissAllNotifications(
  account: Pick<Account, 'baseUrl' | 'username' | 'appPassword'>,
): Promise<void> {
  const url = `${account.baseUrl}/ocs/v2.php/apps/notifications/api/v2/notifications`;
  const res = await trustedFetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: 'Basic ' + btoa(`${account.username}:${account.appPassword}`),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`[dismissAllNotifications] HTTP ${res.status}`);
  }
}
