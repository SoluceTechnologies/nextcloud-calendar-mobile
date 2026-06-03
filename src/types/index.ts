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
  /** True when the server reports no write/bind privilege — event creation blocked. */
  isReadOnly?: boolean;
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

/** Scope for editing/deleting a recurring event instance. */
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
};

export type ServerCapabilities = {
  calendarEnabled: boolean;
  talkEnabled: boolean;
};

export type ViewMode = 'month' | 'week' | '3days' | 'day' | 'schedule';
