import { schemaMigrations, addColumns } from '@nozbe/watermelondb/Schema/migrations';

export const migrations = schemaMigrations({
  migrations: [
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
