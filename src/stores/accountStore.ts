import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import type { ServerCapabilities } from '@/types';

interface AccountState {
  activeAccountId: string | null;
  capabilities: ServerCapabilities;
  setActiveAccountId: (id: string | null) => void;
  setCapabilities: (caps: Partial<ServerCapabilities>) => void;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set) => ({
      activeAccountId: null,
      capabilities: { talkEnabled: false, calendarApp: 'unknown' },
      setActiveAccountId: (id) => set({ activeAccountId: id }),
      setCapabilities: (caps) => set((state) => ({ capabilities: { ...state.capabilities, ...caps } })),
    }),
    {
      name: 'account-store',
      storage: createJSONStorage(() => legacyBackedStorage(['activeAccountId'])),
      partialize: (state) => ({
        activeAccountId: state.activeAccountId,
        capabilities: state.capabilities,
      }),
    }
  )
);
