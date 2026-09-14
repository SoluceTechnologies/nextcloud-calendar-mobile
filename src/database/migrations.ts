import { schemaMigrations, addColumns, unsafeExecuteSql } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
    {
      toVersion: 7,
      steps: [
        addColumns({
          table: 'events',
          columns: [
            { name: 'alarms', type: 'string', isOptional: true },
            { name: 'task_status', type: 'string', isOptional: true },
            { name: 'task_completed_at', type: 'number', isOptional: true },
            { name: 'task_percent', type: 'number', isOptional: true },
          ],
        }),
        unsafeExecuteSql(
          `UPDATE events SET alarms = '[' || alarm_minutes || ']' WHERE alarm_minutes IS NOT NULL;`,
        ),
      ],
    },
    {
      toVersion: 6,
      steps: [
        addColumns({
          table: 'events',
          columns: [{ name: 'recurrence_id', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        addColumns({
          table: 'calendars',
          columns: [{ name: 'supports_events', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'events',
          columns: [{ name: 'is_task', type: 'boolean', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'events',
          columns: [{ name: 'alarm_minutes', type: 'number', isOptional: true }],
        }),
      ],
    },
    {
      toVersion: 2,
      steps: [
        addColumns({
          table: 'calendars',
          columns: [
            { name: 'sync_token', type: 'string', isOptional: true },
            { name: 'expanded_center', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
  ],
});
