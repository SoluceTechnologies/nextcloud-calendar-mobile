// @ts-nocheck

import { Model } from '@nozbe/watermelondb';
import { field } from '@nozbe/watermelondb/decorators';

export default class Calendar extends Model {
  static table = 'calendars';

  @field('account_id') accountId: string;
  @field('remote_id') remoteId: string;
  @field('display_name') displayName: string;
  @field('color') color: string;
  @field('ctag') ctag: string;
  @field('url') url: string;
  @field('slug') slug: string;
  @field('is_subscribed') isSubscribed?: boolean;
  @field('is_read_only') isReadOnly?: boolean;
  @field('source_url') sourceUrl?: string;
}
