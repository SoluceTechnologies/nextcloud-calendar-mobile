import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import { storage } from '@/storage';
import { getInitialLanguage, getInitialWeekStartsOn, type AppLanguage } from '@/utils/i18n';
import type { TalkOpenMode } from '@/types';

const ACCOUNT_IDS_KEY = 'account_ids'; // mirrors services/nextcloud/auth.ts

export type ThemePreference = 'system' | 'light' | 'dark';
export type TimeFormatPreference = 'auto' | '12h' | '24h';
export type MonthViewStyle = 'grid' | 'compact';

export interface SettingsState {
  themePreference: ThemePreference;
  language: AppLanguage;
  weekStartsOn: 0 | 1;
  timeFormat: TimeFormatPreference;
  monthViewStyle: MonthViewStyle;
  liveActivityEnabled: boolean;
  timedAlerts: number[];
  allDayAlerts: number[];
  hapticsEnabled: boolean;
  reduceMotion: boolean;
  talkOpenMode: TalkOpenMode;
  voiceAssistantByAccount: Record<string, boolean>;
  voiceOnDevicePreferred: boolean;
  defaultCalendarByAccount: Record<string, string>;
  setThemePreference: (pref: ThemePreference) => void;
  setLanguage: (lang: AppLanguage) => void;
  setWeekStartsOn: (v: 0 | 1) => void;
  setTimeFormat: (v: TimeFormatPreference) => void;
  setMonthViewStyle: (v: MonthViewStyle) => void;
  setLiveActivityEnabled: (v: boolean) => void;
  setTimedAlerts: (v: number[]) => void;
  setAllDayAlerts: (v: number[]) => void;
  setHapticsEnabled: (v: boolean) => void;
  setReduceMotion: (v: boolean) => void;
  setTalkOpenMode: (v: TalkOpenMode) => void;
  setVoiceAssistantEnabled: (accountId: string, v: boolean) => void;
  setVoiceOnDevicePreferred: (v: boolean) => void;
  setDefaultCalendar: (accountId: string, calendarId: string | undefined) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themePreference: 'system',
      language: getInitialLanguage(),
      weekStartsOn: getInitialWeekStartsOn(),
      timeFormat: 'auto',
      monthViewStyle: 'grid',
      liveActivityEnabled: true,
      timedAlerts: [],
      allDayAlerts: [],
      hapticsEnabled: true,
      reduceMotion: false,
      talkOpenMode: 'app',
      voiceAssistantByAccount: {},
      voiceOnDevicePreferred: true,
      defaultCalendarByAccount: {},
      setTimedAlerts: (v) => set({ timedAlerts: v }),
      setAllDayAlerts: (v) => set({ allDayAlerts: v }),
      setThemePreference: (pref) => set({ themePreference: pref }),
      setLanguage: (lang) => set({ language: lang }),
      setWeekStartsOn: (v) => set({ weekStartsOn: v }),
      setTimeFormat: (v) => set({ timeFormat: v }),
      setMonthViewStyle: (style) => set({ monthViewStyle: style }),
      setLiveActivityEnabled: (v) => set({ liveActivityEnabled: v }),
      setHapticsEnabled: (v) => set({ hapticsEnabled: v }),
      setReduceMotion: (v) => set({ reduceMotion: v }),
      setTalkOpenMode: (v) => set({ talkOpenMode: v }),
      setVoiceAssistantEnabled: (accountId, v) =>
        set((s) => ({ voiceAssistantByAccount: { ...s.voiceAssistantByAccount, [accountId]: v } })),
      setVoiceOnDevicePreferred: (v) => set({ voiceOnDevicePreferred: v }),
      setDefaultCalendar: (accountId, calendarId) =>
        set((s) => {
          const next = { ...s.defaultCalendarByAccount };
          if (calendarId === undefined) delete next[accountId];
          else next[accountId] = calendarId;
          return { defaultCalendarByAccount: next };
        }),
    }),
    {
      name: 'settings-store',
      version: 3,
      migrate: (persisted) => {
        const state = persisted as (Partial<SettingsState> & {
          timedAlert?: number | null;
          allDayAlert?: number | null;
          voiceAssistantEnabled?: boolean;
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
        if (typeof state.voiceAssistantEnabled === 'boolean') {
          if (state.voiceAssistantEnabled) {
            const map: Record<string, boolean> = {};
            try {
              const ids = JSON.parse(storage.getString(ACCOUNT_IDS_KEY) ?? '[]') as string[];
              for (const id of ids) map[id] = true;
            } catch {}
            state.voiceAssistantByAccount = map;
          }
          delete state.voiceAssistantEnabled;
        }
        state.voiceAssistantByAccount ??= {};
        return state;
      },
      storage: createJSONStorage(() =>
        legacyBackedStorage(['themePreference', 'language', 'weekStartsOn'])
      ),
      partialize: (state) => ({
        themePreference: state.themePreference,
        language: state.language,
        weekStartsOn: state.weekStartsOn,
        timeFormat: state.timeFormat,
        monthViewStyle: state.monthViewStyle,
        liveActivityEnabled: state.liveActivityEnabled,
        timedAlerts: state.timedAlerts,
        allDayAlerts: state.allDayAlerts,
        hapticsEnabled: state.hapticsEnabled,
        reduceMotion: state.reduceMotion,
        talkOpenMode: state.talkOpenMode,
        voiceAssistantByAccount: state.voiceAssistantByAccount,
        voiceOnDevicePreferred: state.voiceOnDevicePreferred,
        defaultCalendarByAccount: state.defaultCalendarByAccount,
      }),
    }
  )
);
