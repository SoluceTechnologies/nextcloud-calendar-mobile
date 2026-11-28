import { migrations } from '../../src/database/migrations';
import { mySchema } from '../../src/database/schema';

describe('database migrations', () => {
  it('keeps the schema version aligned with the newest migration without gaps', () => {
    const sorted = migrations.sortedMigrations;

    expect(mySchema.version).toBe(11);
    expect(sorted[sorted.length - 1]?.toVersion).toBe(mySchema.version);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].toVersion).toBe(sorted[i - 1].toVersion + 1);
    }
  });

  it('uses the WatermelonDB index names for href and end upgrades', () => {
    const v10 = migrations.sortedMigrations.find((migration) => migration.toVersion === 10);
    const sqlSteps = v10?.steps.filter((step) => step.type === 'sql').map((step) => step.sql) ?? [];

    expect(sqlSteps).toHaveLength(1);
    expect(sqlSteps[0]).toContain('CREATE INDEX IF NOT EXISTS "events_href" ON "events" ("href");');
    expect(sqlSteps[0]).toContain('CREATE INDEX IF NOT EXISTS "events_end" ON "events" ("end");');
  });

  it('marks href and end indexed in the fresh-install schema', () => {
    const events = mySchema.tables.events;

    expect(events.columns.href.isIndexed).toBe(true);
    expect(events.columns.end.isIndexed).toBe(true);
  });
});
