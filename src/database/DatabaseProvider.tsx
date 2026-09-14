import { Database, Q } from '@nozbe/watermelondb';
import React, { createContext, useContext } from 'react';


import { database } from './index';
import { safeWrite } from './utils/safeTransaction';

const _db: Database = database;

export const getDatabaseInstance = (): Database => _db;
const DatabaseContext = createContext(database);

export const DatabaseProvider = ({ children }: { children: React.ReactNode }) => (
  <DatabaseContext.Provider value={database}>{children}</DatabaseContext.Provider>
);

export const useDatabase = () => useContext(DatabaseContext);

export async function ClearDatabaseForAccount(accountId: string) {
  const db = getDatabaseInstance();
  const tablesWithAccount = ['events', 'calendars'];

  await safeWrite(db, async () => {
    for (const table of tablesWithAccount) {
      const records = await db
        .get(table)
        .query(Q.where('account_id', accountId))
        .fetch();
      await Promise.all(records.map((record) => record.destroyPermanently()));
    }
  }, 10000, 'ClearDatabaseForAccount');
}
