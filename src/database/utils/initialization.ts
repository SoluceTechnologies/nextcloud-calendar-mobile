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

      await this.forceResetDatabaseQueue(db);

      const isResponsive = await this.testInitialDatabaseHealth(db);

      if (!isResponsive) {
        console.warn('Database appears to be unresponsive, attempting recovery...');
        await this.attemptDatabaseRecovery(db);
      }

      this.isInitialized = true;
      console.log('Database initialization completed successfully');
    } catch (err) {
      console.error(`Database initialization failed: ${err}`);
      throw err;
    }
  }

  private async forceResetDatabaseQueue(db: Database): Promise<void> {
    try {
      console.log('Force resetting database queue...');

      for (let i = 0; i < 3; i++) {
        const resetPromise = db.write(async () => {
        });

        await Promise.race([
          resetPromise,
          new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Queue reset ${i + 1} timeout`));
            }, 3000);
          }),
        ]);

        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      console.log('Database queue reset completed');
    } catch (err) {
      console.warn(`Database queue reset failed: ${err}`);
      console.warn('Database may start with degraded performance');
    }
  }

  private async testInitialDatabaseHealth(db: Database): Promise<boolean> {
    try {
      const startTime = Date.now();

      const testPromise = db.collections.get('events').query().fetch();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Database health check timeout'));
        }, 5000);
      });

      await Promise.race([testPromise, timeoutPromise]);

      const duration = Date.now() - startTime;
      console.log(`Database health check passed (${duration}ms)`);

      return duration < 3000;
    } catch (err) {
      console.error(`Database health check failed: ${err}`);
      return false;
    }
  }

  private async attemptDatabaseRecovery(db: Database): Promise<void> {
    try {
      console.log('Attempting database recovery...');

      const recoveryPromise = db.write(async () => {
        const collections = ['events', 'calendars'];
        for (const collectionName of collections) {
          try {
            await db.collections.get(collectionName).query().fetch();
          } catch (err) {
            console.warn(`Failed to read from ${collectionName}: ${err}`);
          }
        }
      });

      await Promise.race([
        recoveryPromise,
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Recovery timeout'));
          }, 10000);
        }),
      ]);

      console.log('Database recovery completed');
    } catch (err) {
      console.error(`Database recovery failed: ${err}`);
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }
}

export async function initializeDatabaseOnStartup(): Promise<void> {
  const initializer = DatabaseInitializer.getInstance();
  await initializer.initializeDatabase();
}
