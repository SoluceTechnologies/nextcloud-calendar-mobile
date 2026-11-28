import { Database } from '@nozbe/watermelondb';

import { getDatabaseInstance } from '../DatabaseProvider';

export class DatabaseInitializer {
  private static instance: DatabaseInitializer;
  private isInitialized = false;

  static getInstance(): DatabaseInitializer {
    if (!DatabaseInitializer.instance) {
      DatabaseInitializer.instance = new DatabaseInitializer();
    }
    return DatabaseInitializer.instance;
  }

  async initializeDatabase(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const db = getDatabaseInstance();
      await this.probeDatabase(db);
      this.isInitialized = true;
      console.log('Database initialization completed successfully');
    } catch (err) {
      console.error(`Database initialization failed: ${err}`);
      throw err;
    }
  }

  private async probeDatabase(db: Database): Promise<void> {
    const startedAt = Date.now();
    await db.collections.get('events').query().fetchCount();
    console.log(`Database probe completed (${Date.now() - startedAt}ms)`);
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export async function initializeDatabaseOnStartup(): Promise<void> {
  const initializer = DatabaseInitializer.getInstance();
  await initializer.initializeDatabase();
}
