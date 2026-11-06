import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import type { ViewMode } from '@/types';

interface CalendarState {
  viewMode: ViewMode;
  selectedDate: Date | null;
  hiddenCalendarIds: string[];
  notifDisabledCalendarIds: string[];
  widgetDisabledCalendarIds: string[];
  hourRowHeight: number;
  showCompletedTasks: boolean;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: Date | null) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
  toggleCalendarNotifications: (calendarId: string) => void;
  toggleCalendarWidget: (calendarId: string) => void;
  setHourRowHeight: (h: number) => void;
  toggleShowCompletedTasks: () => void;
}

function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export const useCalendarStore = create<CalendarState>()(
  persist(
    (set, get) => ({
      viewMode: 'week',
      selectedDate: null,
      hiddenCalendarIds: [],
      notifDisabledCalendarIds: [],
      widgetDisabledCalendarIds: [],
      hourRowHeight: 60,
      showCompletedTasks: false,
      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      toggleCalendarVisibility: (calendarId) =>
        set({ hiddenCalendarIds: toggleIn(get().hiddenCalendarIds, calendarId) }),
      toggleCalendarNotifications: (calendarId) =>
        set({ notifDisabledCalendarIds: toggleIn(get().notifDisabledCalendarIds, calendarId) }),
      toggleCalendarWidget: (calendarId) =>
        set({ widgetDisabledCalendarIds: toggleIn(get().widgetDisabledCalendarIds, calendarId) }),
      setHourRowHeight: (h) => set({ hourRowHeight: h }),
      toggleShowCompletedTasks: () =>
        set({ showCompletedTasks: !get().showCompletedTasks }),
    }),
    {
      name: 'calendar-store',
      storage: createJSONStorage(() =>
        legacyBackedStorage(['viewMode', 'hiddenCalendarIds', 'notifDisabledCalendarIds', 'widgetDisabledCalendarIds', 'hourRowHeight', 'showCompletedTasks'])
      ),
      partialize: (state) => ({
        viewMode: state.viewMode,
        hiddenCalendarIds: state.hiddenCalendarIds,
        notifDisabledCalendarIds: state.notifDisabledCalendarIds,
        widgetDisabledCalendarIds: state.widgetDisabledCalendarIds,
        hourRowHeight: state.hourRowHeight,
        showCompletedTasks: state.showCompletedTasks,
      }),
    }
  )
);
