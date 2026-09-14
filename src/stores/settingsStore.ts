import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import { getInitialLanguage, getInitialWeekStartsOn, type AppLanguage } from '@/utils/i18n';
import type { TalkOpenMode } from '@/types';

export type ThemePreference = 'system' | 'light' | 'dark';

interface SettingsState {
  themePreference: ThemePreference;
  language: AppLanguage;
  weekStartsOn: 0 | 1;
  liveActivityEnabled: boolean;
  // Default reminder offsets: minutes before start for timed events, days
  // before (at ALL_DAY_HOUR) for all-day events. Empty = no default.
  timedAlerts: number[];
  allDayAlerts: number[];
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  talkOpenMode: TalkOpenMode;
  setThemePreference: (pref: ThemePreference) => void;
  setLanguage: (lang: AppLanguage) => void;
  setWeekStartsOn: (v: 0 | 1) => void;
  setLiveActivityEnabled: (v: boolean) => void;
  setTimedAlerts: (v: number[]) => void;
  setAllDayAlerts: (v: number[]) => void;
  setHapticsEnabled: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  setTalkOpenMode: (v: TalkOpenMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      language: getInitialLanguage(),
      weekStartsOn: getInitialWeekStartsOn(),
      liveActivityEnabled: true,
      timedAlerts: [],
      allDayAlerts: [],
      hapticsEnabled: true,
      reduceMotion: false,
      talkOpenMode: 'app',
      setTimedAlerts: (v) => set({ timedAlerts: v }),
      setAllDayAlerts: (v) => set({ allDayAlerts: v }),
      setThemePreference: (pref) => set({ themePreference: pref }),
      setLanguage: (lang) => set({ language: lang }),
      setWeekStartsOn: (v) => set({ weekStartsOn: v }),
      setLiveActivityEnabled: (v) => set({ liveActivityEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setReduceMotion: (v) => set({ reduceMotion: v }),
      setTalkOpenMode: (v) => set({ talkOpenMode: v }),
    }),
    {
      name: 'settings-store',
      version: 2,
      migrate: (persisted) => {
        const state = persisted as (Partial<SettingsState> & {
          timedAlert?: number | null;
          allDayAlert?: number | null;
        }) | undefined;
        if (!state) return state;
        if (!Array.isArray(state.timedAlerts)) {
          state.timedAlerts = state.timedAlert != null ? [state.timedAlert] : [];
        }
        if (!Array.isArray(state.allDayAlerts)) {
          state.allDayAlerts = state.allDayAlert != null ? [state.allDayAlert] : [];
        }
        delete state.timedAlert;
        delete state.allDayAlert;
        return state;
      },
      storage: createJSONStorage(() =>
        legacyBackedStorage(['themePreference', 'language', 'weekStartsOn'])
      ),
      partialize: (state) => ({
        themePreference: state.themePreference,
        language: state.language,
        weekStartsOn: state.weekStartsOn,
        liveActivityEnabled: state.liveActivityEnabled,
        timedAlerts: state.timedAlerts,
        allDayAlerts: state.allDayAlerts,
        hapticsEnabled: state.hapticsEnabled,
        reduceMotion: state.reduceMotion,
        talkOpenMode: state.talkOpenMode,
      }),
    }
  )
);
