export type PushConnectionStatus =
  | 'idle'
  | 'discovering'
  | 'connecting'
  | 'connected'
  | 'auth'
  | 'reconnecting'
  | 'unsupported'
  | 'error';

export type PushMessageType =
  | 'notify_file'
  | 'notify_file_id'
  | 'notify_activity'
  | 'notify_notification'
  | 'notify_custom'
  | 'notify_pre_auth'
  | 'notify_config'
  | 'notify_query'
  | string;

export type CalendarSyncPayload = {
  calendarUrl: string;
};

export type PushCustomMessage = {
  message: string;
  body: Record<string, unknown>;
};

export type PushMessage = {
  type: PushMessageType;
  payload?: unknown;
};

export type PushListener = (message: PushMessage) => void;
