import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { legacyBackedStorage } from '@/stores/legacyStorage';
import type { ViewMode } from '@/types';

export type MonthWidgetFontSize = 'small' | 'normal' | 'large' | 'xlarge' | 'huge';
export type MonthWidgetFontWeight = 'light' | 'normal' | 'medium' | 'bold' | 'black';
export type MonthWidgetTheme = 'system' | 'light' | 'dark';
export type MonthWidgetCardStyle = 'card' | 'borderless' | 'transparent';
export type MonthWidgetDayTap = 'calendar' | 'newEvent';

interface CalendarState {
  viewMode: ViewMode;
  selectedDate: Date | null;
  hiddenCalendarIds: string[];
  notifDisabledCalendarIds: string[];
  widgetDisabledCalendarIds: string[];
  monthWidgetFontSize: MonthWidgetFontSize;
  monthWidgetFontWeight: MonthWidgetFontWeight;
  monthWidgetTheme: MonthWidgetTheme;
  monthWidgetCardStyle: MonthWidgetCardStyle;
  monthWidgetDayTap: MonthWidgetDayTap;
  hourRowHeight: number;
  setViewMode: (mode: ViewMode) => void;
  setSelectedDate: (date: Date | null) => void;
  toggleCalendarVisibility: (calendarId: string) => void;
  toggleCalendarNotifications: (calendarId: string) => void;
  toggleCalendarWidget: (calendarId: string) => void;
  setMonthWidgetFontSize: (value: MonthWidgetFontSize) => void;
  setMonthWidgetFontWeight: (value: MonthWidgetFontWeight) => void;
  setMonthWidgetTheme: (value: MonthWidgetTheme) => void;
  setMonthWidgetCardStyle: (value: MonthWidgetCardStyle) => void;
  setMonthWidgetDayTap: (value: MonthWidgetDayTap) => void;
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
      monthWidgetFontSize: 'large',
      monthWidgetFontWeight: 'light',
      monthWidgetTheme: 'system',
      monthWidgetCardStyle: 'card',
      monthWidgetDayTap: 'calendar',
      hourRowHeight: 60,
      setViewMode: (mode) => set({ viewMode: mode }),
      setSelectedDate: (date) => set({ selectedDate: date }),
      toggleCalendarVisibility: (calendarId) =>
        set({ hiddenCalendarIds: toggleIn(get().hiddenCalendarIds, calendarId) }),
      toggleCalendarNotifications: (calendarId) =>
        set({ notifDisabledCalendarIds: toggleIn(get().notifDisabledCalendarIds, calendarId) }),
      toggleCalendarWidget: (calendarId) =>
        set({ widgetDisabledCalendarIds: toggleIn(get().widgetDisabledCalendarIds, calendarId) }),
      setMonthWidgetFontSize: (monthWidgetFontSize) => set({ monthWidgetFontSize }),
      setMonthWidgetFontWeight: (monthWidgetFontWeight) => set({ monthWidgetFontWeight }),
      setMonthWidgetTheme: (monthWidgetTheme) => set({ monthWidgetTheme }),
      setMonthWidgetCardStyle: (monthWidgetCardStyle) => set({ monthWidgetCardStyle }),
      setMonthWidgetDayTap: (monthWidgetDayTap) => set({ monthWidgetDayTap }),
      setHourRowHeight: (h) => set({ hourRowHeight: h }),
    }),
    {
      name: 'calendar-store',
      storage: createJSONStorage(() =>
        legacyBackedStorage([
          'viewMode', 'hiddenCalendarIds', 'notifDisabledCalendarIds', 'widgetDisabledCalendarIds', 'hourRowHeight',
          'monthWidgetFontSize', 'monthWidgetFontWeight', 'monthWidgetTheme', 'monthWidgetCardStyle', 'monthWidgetDayTap',
        ])
      ),
      partialize: (state) => ({
        viewMode: state.viewMode,
        hiddenCalendarIds: state.hiddenCalendarIds,
        notifDisabledCalendarIds: state.notifDisabledCalendarIds,
        widgetDisabledCalendarIds: state.widgetDisabledCalendarIds,
        monthWidgetFontSize: state.monthWidgetFontSize,
        monthWidgetFontWeight: state.monthWidgetFontWeight,
        monthWidgetTheme: state.monthWidgetTheme,
        monthWidgetCardStyle: state.monthWidgetCardStyle,
        monthWidgetDayTap: state.monthWidgetDayTap,
        hourRowHeight: state.hourRowHeight,
      }),
    }
  )
);
