import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import type { ServerCapabilities } from '@/types';

interface AccountState {
  activeAccountId: string | null;
  /** Accounts hidden from the merged calendar view. Absent = enabled. */
  disabledAccountIds: string[];
  capabilities: ServerCapabilities;
  setActiveAccountId: (id: string | null) => void;
  setAccountDisabled: (id: string, disabled: boolean) => void;
  setCapabilities: (caps: ServerCapabilities) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      activeAccountId: null,
      disabledAccountIds: [],
      capabilities: { talkEnabled: false, calendarApp: 'unknown' },
      setActiveAccountId: (id) => set({ activeAccountId: id }),
      setAccountDisabled: (id, disabled) =>
        set((s) => ({
          disabledAccountIds: disabled
            ? [...new Set([...s.disabledAccountIds, id])]
            : s.disabledAccountIds.filter((x) => x !== id),
        })),
      setCapabilities: (caps) => set({ capabilities: caps }),
    }),
    {
      name: 'account-store',
      storage: createJSONStorage(() => legacyBackedStorage(['activeAccountId'])),
      partialize: (state) => ({
        activeAccountId: state.activeAccountId,
        disabledAccountIds: state.disabledAccountIds,
        capabilities: state.capabilities,
      }),
    }
  )
);
