export const APP_SCHEME = 'nextcloud-calendar';

export interface AgendaEventItem {
  uid: string;
  title: string;
  startIso: string;
  endIso: string;
  allDay: boolean;
  color: string;
  timeLabel: string;
  deepLink: string;
}

export interface AgendaDaySection {
  dayKey: string;
  dayLabel: string;
  dayNumber: string;
  weekdayLong: string;
  isToday: boolean;
  items: AgendaEventItem[];
}

export interface AgendaSnapshot {
  generatedAtIso: string;
  timeZone: string;
  locale?: string;
  scheme: 'light' | 'dark';
  dayLabel: string;
  dayNumber: string;
  relativeLabel: string;
  events: AgendaEventItem[];
  sections: AgendaDaySection[];
  nextEvent?: AgendaEventItem;
}

export interface AgendaTimelineEntry {
  atIso: string;
  snapshot: AgendaSnapshot;
}

export interface LiveEventState {
  uid: string;
  title: string;
  startIso: string;
  endIso: string;
  color: string;
  link: string;
  location: string;
  videoProvider?: string;
  attendees: string[];
}

export interface WidgetSurface<P> {
  readonly id: 'homeWidget' | 'liveActivity';
  isSupported(): boolean;
  update(payload: P): Promise<void>;
  clear(): Promise<void>;
  requestPermission?(): Promise<boolean>;
  canPromote?(): boolean;
}

export function eventDeepLink(uid: string): string {
  return `${APP_SCHEME}://event/${encodeURIComponent(uid)}`;
}

export function openAppLink(): string {
  return `${APP_SCHEME}:///`;
}
