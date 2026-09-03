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
  supportsEvents?: boolean;
};

export type Attendee = {
  email: string;
  displayName?: string;
  partstat?: string;
  role?: string;
};

export type RecurrenceFreq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export type RecurrenceRule = {
  freq: RecurrenceFreq;
  interval?: number;
  count?: number;
  until?: Date;
  byDay?: string[];
  byMonth?: number[];
  byWeekNo?: number[];
};

export type RecurrenceEditScope = 'this' | 'thisAndFollowing' | 'all';

export type TalkRoomType = 'public' | 'private';

export type InvitationStatus = 'needs-action' | 'accepted' | 'declined' | 'tentative';

export type InvitationResponse = 'accepted' | 'declined' | 'tentative';

export type CalendarInvitation = {
  uid: string;
  href: string;
  accountId: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: Date;
  dtend: Date;
  allDay: boolean;
  organizerEmail?: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeDisplayName?: string;
  partstat: InvitationStatus;
  method: string;
  ics: string;
  timezone?: string;
  talkUrl?: string;
  isRecurring: boolean;
  rrule?: string;
  alarmMinutes?: number;
};

export type TalkOpenMode = 'app' | 'browser' | 'ask';

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
  recurrenceId?: Date;
  alarmMinutes?: number;
  isTask?: boolean;
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
