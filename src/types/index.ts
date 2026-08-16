export type Account = {
  id: string;
  displayName: string;
  baseUrl: string;
  username: string;
  appPassword: string;
  davUserId: string;
  timezone?: string;
  email?: string;
};

export type CalendarMeta = {
  id: string;
  accountId: string;
  displayName: string;
  color: string;
  ctag: string;
  url: string;
  slug: string;
  isSubscribed?: boolean;
  isReadOnly?: boolean;
  sourceUrl?: string;
  // False when the calendar cannot hold VEVENTs (its supported-calendar-
  // component-set lacks VEVENT), e.g. Deck boards / Tasks lists, which only
  // accept VTODOs. Such calendars are excluded from the create-event picker.
  supportsEvents?: boolean;
};

export type Attendee = {
  email: string;
  displayName?: string;
};

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval?: number;
  count?: number;
  until?: Date;
  byDay?: string[];
};

export type RecurrenceEditScope = 'this' | 'thisAndFollowing' | 'all';

export type TalkRoomType = 'public' | 'private';

export type CalendarEvent = {
  uid: string;
  href: string;
  calendarId: string;
  accountId: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: Date;
  dtend: Date;
  allDay: boolean;
  color: string;
  attendees: Attendee[];
  organizerEmail?: string;
  talkUrl?: string;
  isRecurring: boolean;
  rrule?: string;
  alarmMinutes?: number;
  // True for VTODO-derived items (Deck cards, Tasks app). Read-only in this app:
  // it is not a VEVENT and editing it through the event form would corrupt it.
  isTask?: boolean;
  // Derived at render time (not persisted): the event's calendar is read-only or
  // a subscription. Used to disable drag/drop for events that cannot be written.
  readOnly?: boolean;
};

export type CreateEventInput = {
  summary: string;
  calendarId: string;
  dtstart: Date;
  dtend: Date;
  allDay: boolean;
  description?: string;
  location?: string;
  attendees: Attendee[];
  withTalkRoom: boolean;
  talkRoomType?: TalkRoomType;
  organizerEmail: string;
  organizerName: string;
  rrule?: RecurrenceRule;
  alarmMinutes?: number;
};

export type CalendarAppStatus = 'unknown' | 'available' | 'unconfigured';

export type ServerCapabilities = {
  talkEnabled: boolean;
  calendarApp: CalendarAppStatus;
};

export type ViewMode = 'month' | 'week' | '3days' | 'day' | 'schedule';
