import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { useAppStore } from '@/store/appStore';
import { trailingDebounce } from '@/utils/debounce';
import type { AgendaViewHandle } from '@/components/AgendaView';
import type { ViewMode } from '@/types';
import { CAL_MODES, isCalMode, type CalMode } from '../constants';

const FETCH_DATE_DEBOUNCE_MS = 300;

export function useCalendarNavigation() {
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const isCalendarMode = isCalMode(viewMode);

  // `date` updates immediately (header, month, agenda). `fetchDate` lags during
  // rapid swipes so the events query window — and the heavy Calendar rebuild it
  // triggers — only changes once the user settles.
  const [date, setDateState] = useState(new Date());
  const [fetchDate, setFetchDate] = useState(date);
  const [agendaVisibleDate, setAgendaVisibleDate] = useState(date);
  const agendaRef = useRef<AgendaViewHandle>(null);

  // Created once; setFetchDate is a stable useState setter.
  const fetchDebounce = useRef(
    trailingDebounce((d: Date) => setFetchDate(d), FETCH_DATE_DEBOUNCE_MS)
  ).current;

  // Immediate setter for everything that is NOT a swipe (taps, Today, switch,
  // month nav): keeps date and fetchDate in lockstep and cancels any pending
  // swipe update so a stale swipe position can't land afterwards.
  const setDate = useCallback((d: Date) => {
    fetchDebounce.cancel();
    setDateState(d);
    setFetchDate(d);
  }, [fetchDebounce]);

  const [calDates, setCalDates] = useState<Record<CalMode, Date>>(() => {
    const now = new Date();
    return { week: now, '3days': now, day: now };
  });
  const calInternalRef = useRef<Record<CalMode, Date>>({ ...calDates });

  const [mountedCalModes, setMountedCalModes] = useState<Set<CalMode>>(
    () => new Set([isCalendarMode ? (viewMode as CalMode) : 'week'])
  );

  const dateRef = useRef(date); dateRef.current = date;
  const viewModeRef = useRef(viewMode); viewModeRef.current = viewMode;
  const agendaVisibleDateRef = useRef(agendaVisibleDate); agendaVisibleDateRef.current = agendaVisibleDate;

  useEffect(() => { if (viewMode === 'schedule') setAgendaVisibleDate(date); }, [date, viewMode]);

  useEffect(() => {
    const handle = requestIdleCallback(() => {
      setMountedCalModes((prev) =>
        prev.has('week') && prev.has('3days') && prev.has('day')
          ? prev
          : new Set<CalMode>(CAL_MODES)
      );
    }, { timeout: 800 });
    return () => cancelIdleCallback(handle);
  }, []);

  const switchMode = useCallback((target: ViewMode) => {
    const f = viewModeRef.current === 'schedule' ? agendaVisibleDateRef.current : dateRef.current;
    if (isCalMode(target)) {
      setMountedCalModes((prev) => (prev.has(target) ? prev : new Set(prev).add(target)));
      if (!dayjs(calInternalRef.current[target]).isSame(f, 'day')) {
        calInternalRef.current[target] = f;
        setCalDates((prev) => ({ ...prev, [target]: f }));
      }
    }
    if (target !== 'schedule' && !dayjs(f).isSame(dateRef.current, 'day')) setDate(f);
    setViewMode(target);
  }, [setViewMode, setDate]);

  const goToday = useCallback(() => {
    const now = new Date();
    setDate(now);
    const vm = viewModeRef.current;
    if (vm === 'schedule') {
      setAgendaVisibleDate(now);
      agendaRef.current?.scrollToToday();
    } else if (isCalMode(vm)) {
      calInternalRef.current[vm] = now;
      setCalDates((prev) => ({ ...prev, [vm]: now }));
    }
  }, [setDate]);

  // Swipe path: header date updates now; the fetch window is debounced so a fast
  // multi-week swipe does not refetch + rebuild the calendar on every frame.
  const onSwipeEndHandlers = useMemo<Record<CalMode, (d: Date) => void>>(() => ({
    week: (d) => { calInternalRef.current.week = d; setDateState(d); fetchDebounce.call(d); },
    '3days': (d) => { calInternalRef.current['3days'] = d; setDateState(d); fetchDebounce.call(d); },
    day: (d) => { calInternalRef.current.day = d; setDateState(d); fetchDebounce.call(d); },
  }), [fetchDebounce]);

  const navigateMonth = useCallback((dir: 1 | -1) => {
    setDate(dayjs(dateRef.current).add(dir, 'month').toDate());
  }, [setDate]);

  return {
    viewMode,
    isCalendarMode,
    date,
    fetchDate,
    setDate,
    agendaVisibleDate,
    setAgendaVisibleDate,
    agendaRef,
    calDates,
    mountedCalModes,
    switchMode,
    goToday,
    navigateMonth,
    onSwipeEndHandlers,
  };
}
