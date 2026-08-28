import type { Account, CalendarEvent } from '@/types';
import { isEventPending } from '@/utils/eventPending';

export interface GridEvent {
  title: string;
  start: Date;
  end: Date;
  color: string;
  isPending?: boolean;
  _event: CalendarEvent;
}

export function toGridEvents(events: CalendarEvent[], account?: Account | null): GridEvent[] {
  return events.map((e) => ({
    title: e.summary,
    start: e.dtstart,
    end: e.dtend,
    color: e.color,
    isPending: isEventPending(e, account ?? null),
    _event: e,
  }));
}
