import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

import { zustandStorage } from '@/storage';
import { isEmptyModel, toStored, type SearchModel } from '@/features/search/searchModel';
import { toTerm } from '@/features/search/searchSyntax';

export type RecentSearch = { id: string; term: string; model: SearchModel; at: number };

const MAX_RECENT = 5;

interface RecentSearchState {
  byAccount: Record<string, RecentSearch[]>;
  add: (accountId: string, model: SearchModel) => void;
  remove: (accountId: string, id: string) => void;
}

export const useRecentSearchStore = create<RecentSearchState>()(
  persist(
    (set) => ({
      byAccount: {},
      add: (accountId, model) =>
        set((state) => {
          const stored = toStored(model);
          if (isEmptyModel(stored)) return state;
          const term = toTerm(stored);
          const others = (state.byAccount[accountId] ?? []).filter((entry) => entry.term !== term);
          const entry: RecentSearch = { id: term, term, model: stored, at: Date.now() };
          return { byAccount: { ...state.byAccount, [accountId]: [entry, ...others].slice(0, MAX_RECENT) } };
        }),
      remove: (accountId, id) =>
        set((state) => ({
          byAccount: {
            ...state.byAccount,
            [accountId]: (state.byAccount[accountId] ?? []).filter((entry) => entry.id !== id),
          },
        })),
    }),
    {
      name: 'recent-search-store',
      version: 1,
      storage: createJSONStorage(() => zustandStorage),
      partialize: (state) => ({ byAccount: state.byAccount }),
    },
  ),
);
