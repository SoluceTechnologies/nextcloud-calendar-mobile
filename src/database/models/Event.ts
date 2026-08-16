// @ts-nocheck

import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Event extends Model {
  static table = 'events';

  static associations = {
    calendars: { type: 'belongs_to', key: 'calendar_id' },
  };

  @field('account_id') accountId: string;
  @field('calendar_id') calendarId: string;
  @field('uid') uid: string;
  @field('href') href: string;
  @field('summary') summary: string;
  @field('description') description?: string;
  @field('location') location?: string;
  @field('start') start: number;
  @field('end') end: number;
  @field('all_day') allDay?: boolean;
  @field('color') color: string;
  @field('attendees') attendees?: string;
  @field('organizer_email') organizerEmail?: string;
  @field('talk_url') talkUrl?: string;
  @field('is_recurring') isRecurring?: boolean;
  @field('rrule') rrule?: string;
  @field('alarm_minutes') alarmMinutes?: number;
  @field('is_task') isTask?: boolean;
}
