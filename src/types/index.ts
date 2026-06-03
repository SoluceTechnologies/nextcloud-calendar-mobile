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
};

export type Attendee = {
  email: string;
  displayName?: string;
};

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
  organizerEmail: string;
  organizerName: string;
};

export type ViewMode = 'month' | 'week' | '3days' | 'day' | 'schedule';
