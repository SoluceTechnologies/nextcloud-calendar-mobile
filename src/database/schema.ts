import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const mySchema = appSchema({
  version: 2,
  tables: [
    tableSchema({
      name: 'events',
      columns: [
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'calendar_id', type: 'string', isIndexed: true },
        { name: 'uid', type: 'string', isIndexed: true },
        { name: 'href', type: 'string' },
        { name: 'summary', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'location', type: 'string', isOptional: true },
        { name: 'start', type: 'number', isIndexed: true },
        { name: 'end', type: 'number' },
        { name: 'all_day', type: 'boolean', isOptional: true },
        { name: 'color', type: 'string' },
        { name: 'attendees', type: 'string', isOptional: true },
        { name: 'organizer_email', type: 'string', isOptional: true },
        { name: 'talk_url', type: 'string', isOptional: true },
        { name: 'is_recurring', type: 'boolean', isOptional: true },
        { name: 'rrule', type: 'string', isOptional: true },
      ],
    }),
    tableSchema({
      name: 'calendars',
      columns: [
        { name: 'account_id', type: 'string', isIndexed: true },
        { name: 'remote_id', type: 'string', isIndexed: true },
        { name: 'display_name', type: 'string' },
        { name: 'color', type: 'string' },
        { name: 'ctag', type: 'string' },
        { name: 'url', type: 'string' },
        { name: 'slug', type: 'string' },
        { name: 'is_subscribed', type: 'boolean', isOptional: true },
        { name: 'is_read_only', type: 'boolean', isOptional: true },
        { name: 'source_url', type: 'string', isOptional: true },
        { name: 'sync_token', type: 'string', isOptional: true },
        { name: 'expanded_center', type: 'number', isOptional: true },
      ],
    }),
  ],
});
