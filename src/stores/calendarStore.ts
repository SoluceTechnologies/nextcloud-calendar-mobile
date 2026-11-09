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
  /** User overrides for "counts for availability" — absent id defaults to !isReadOnly. */
  availabilityCalendarOverrides: Record<string, boolean>;
  hourRowHeight: number;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: Date | null) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
  toggleCalendarNotifications: (calendarId: string) => void;
  toggleCalendarWidget: (calendarId: string) => void;
  setCalendarAvailability: (calendarId: string, value: boolean) => void;
  setHourRowHeight: (h: number) => void;
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
      availabilityCalendarOverrides: {},
      hourRowHeight: 60,
      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      toggleCalendarVisibility: (calendarId) =>
        set({ hiddenCalendarIds: toggleIn(get().hiddenCalendarIds, calendarId) }),
      toggleCalendarNotifications: (calendarId) =>
        set({ notifDisabledCalendarIds: toggleIn(get().notifDisabledCalendarIds, calendarId) }),
      toggleCalendarWidget: (calendarId) =>
        set({ widgetDisabledCalendarIds: toggleIn(get().widgetDisabledCalendarIds, calendarId) }),
      setCalendarAvailability: (calendarId, value) =>
        set({ availabilityCalendarOverrides: { ...get().availabilityCalendarOverrides, [calendarId]: value } }),
      setHourRowHeight: (h) => set({ hourRowHeight: h }),
    }),
    {
      name: 'calendar-store',
      storage: createJSONStorage(() =>
        legacyBackedStorage(['viewMode', 'hiddenCalendarIds', 'notifDisabledCalendarIds', 'widgetDisabledCalendarIds', 'availabilityCalendarOverrides', 'hourRowHeight'])
      ),
      partialize: (state) => ({
        viewMode: state.viewMode,
        hiddenCalendarIds: state.hiddenCalendarIds,
        notifDisabledCalendarIds: state.notifDisabledCalendarIds,
        widgetDisabledCalendarIds: state.widgetDisabledCalendarIds,
        availabilityCalendarOverrides: state.availabilityCalendarOverrides,
        hourRowHeight: state.hourRowHeight,
      }),
    }
  )
);
