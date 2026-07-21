import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import Calendar from '@/database/models/Calendar';
import Event from '@/database/models/Event';

import { mySchema } from './schema';

const adapter = new SQLiteAdapter({
  schema: mySchema,
});

export const database = new Database({
  adapter,
  modelClasses: [Event, Calendar],
});
