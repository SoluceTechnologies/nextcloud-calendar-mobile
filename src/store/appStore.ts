import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ViewMode } from '@/types';

export type ThemePreference = 'system' | 'light' | 'dark';

interface AppState {
  activeAccountId: string | null;
  viewMode: ViewMode;
  selectedDate: Date | null;
  hiddenCalendarIds: string[];
  themePreference: ThemePreference;
  hourRowHeight: number;
  weekStartsOn: 0 | 1;
  setActiveAccountId: (id: string | null) => void;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: Date | null) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
  setThemePreference: (pref: ThemePreference) => void;
  setHourRowHeight: (h: number) => void;
  setWeekStartsOn: (v: 0 | 1) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeAccountId: null,
      viewMode: 'week',
      selectedDate: null,
      hiddenCalendarIds: [],
      themePreference: 'system',
      hourRowHeight: 60,
      weekStartsOn: 0,
      setActiveAccountId: (id) => set({ activeAccountId: id }),
      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      toggleCalendarVisibility: (calendarId) => {
        const { hiddenCalendarIds } = get();
        if (hiddenCalendarIds.includes(calendarId)) {
          set({ hiddenCalendarIds: hiddenCalendarIds.filter((id) => id !== calendarId) });
        } else {
          set({ hiddenCalendarIds: [...hiddenCalendarIds, calendarId] });
        }
      },
      setThemePreference: (pref) => set({ themePreference: pref }),
      setHourRowHeight: (h) => set({ hourRowHeight: h }),
      setWeekStartsOn: (v) => set({ weekStartsOn: v }),
    }),
    {
      name: 'app-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        activeAccountId: state.activeAccountId,
        viewMode: state.viewMode,
        hiddenCalendarIds: state.hiddenCalendarIds,
        themePreference: state.themePreference,
        hourRowHeight: state.hourRowHeight,
        weekStartsOn: state.weekStartsOn,
      }),
    }
  )
);
