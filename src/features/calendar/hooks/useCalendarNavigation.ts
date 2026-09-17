import { useCallback, useEffect, useRef, useState } from 'react';
import { useCalendarStore } from '@/stores/calendarStore';
import { trailingDebounce } from '@/utils/debounce';
import type { AgendaViewHandle } from '@/features/calendar/components/AgendaView';
import type { ViewMode } from '@/types';
import { isCalMode } from '../constants';

const FETCH_DATE_DEBOUNCE_MS = 300;

export function useCalendarNavigation() {
  const viewMode = useCalendarStore((s) => s.viewMode);
  const setViewMode = useCalendarStore((s) => s.setViewMode);
  const isCalendarMode = isCalMode(viewMode);

  const [date, setDateState] = useState(() => new Date());
  const [anchorDate, setAnchorDate] = useState(date);
  const [fetchDate, setFetchDate] = useState(date);
  const [agendaVisibleDate, setAgendaVisibleDate] = useState(date);
  const [jump, setJump] = useState<{ nonce: number; target: Date }>(() => ({ nonce: 0, target: date }));
  const agendaRef = useRef<AgendaViewHandle>(null);

  const fetchDebounce = useRef(
    trailingDebounce((d: Date) => setFetchDate(d), FETCH_DATE_DEBOUNCE_MS)
  ).current;

  const dateRef = useRef(date); dateRef.current = date;
  const viewModeRef = useRef(viewMode); viewModeRef.current = viewMode;
  const agendaVisibleDateRef = useRef(agendaVisibleDate);
  agendaVisibleDateRef.current = agendaVisibleDate;

  const setDate = useCallback((d: Date) => {
    fetchDebounce.cancel();
    setDateState(d);
    setFetchDate(d);
    setJump((j) => ({ nonce: j.nonce + 1, target: d }));
  }, [fetchDebounce]);

  const onPageChange = useCallback((d: Date) => {
    setDateState(d);
    fetchDebounce.call(d);
  }, [fetchDebounce]);

  useEffect(() => { if (viewMode === 'schedule') setAgendaVisibleDate(date); }, [date, viewMode]);

  // Agenda scrolling moves the fetch window so past/future months get synced.
  useEffect(() => {
    if (viewMode !== 'schedule') return;
    fetchDebounce.call(agendaVisibleDate);
  }, [viewMode, agendaVisibleDate, fetchDebounce]);

  const switchMode = useCallback((target: ViewMode) => {
    const focus = viewModeRef.current === 'schedule'
      ? agendaVisibleDateRef.current
      : dateRef.current;
    if (target !== 'schedule') {
      setAnchorDate(focus);
      setDate(focus);
    }
    setViewMode(target);
  }, [setViewMode, setDate]);

  const goToday = useCallback(() => {
    const now = new Date();
    setDate(now);
    if (viewModeRef.current === 'schedule') {
      setAgendaVisibleDate(now);
      agendaRef.current?.scrollToToday();
    }
  }, [setDate]);

  return {
    viewMode,
    isCalendarMode,
    date,
    anchorDate,
    jump,
    fetchDate,
    setDate,
    agendaVisibleDate,
    setAgendaVisibleDate,
    agendaRef,
    switchMode,
    goToday,
    onPageChange,
  };
}
