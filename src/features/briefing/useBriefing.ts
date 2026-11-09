import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import { useSettingsStore } from '@/stores/settingsStore';
import { getNativePickerLocale } from '@/utils/i18n';
import { resolveUse24h } from '@/utils/timeFormat';
import { readUpcomingEvents } from '@/features/widget/core/readEvents';
import * as tts from '@/services/voice/tts';

import {
  buildBriefing,
  briefingDayLabel,
  briefingVoiceLocale,
  type BriefingEventInput,
} from './speechText';
import type { BriefingSegment } from './types';

export type BriefingTextBuilder = (
  events: BriefingEventInput[],
  opts: { locale?: string; use24h?: boolean; now?: Date; day?: Date; maxSegments?: number },
) => BriefingSegment[];

export type BriefingState = 'idle' | 'speaking' | 'paused' | 'done';

export interface BriefingController {
  state: BriefingState;
  index: number;
  segments: BriefingSegment[];
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  next: () => void;
  stop: () => void;
}

export function useBriefing(
  day: Date,
  buildText: BriefingTextBuilder = buildBriefing,
): BriefingController {
  const { t } = useTranslation();
  const language = useSettingsStore((s) => s.language);
  const timeFormat = useSettingsStore((s) => s.timeFormat);

  const [state, setState] = useState<BriefingState>('idle');
  const [index, setIndex] = useState(0);
  const [segments, setSegments] = useState<BriefingSegment[]>([]);

  // Generation id: bumped by every start()/next()/stop() so a stale
  // readUpcomingEvents resolution or onDone chain can never double-speak.
  const genRef = useRef(0);
  const segmentsRef = useRef<BriefingSegment[]>([]);
  const indexRef = useRef(0);
  const localeRef = useRef('en-US');
  // Mirror of `state` for synchronous guards inside fired callbacks.
  const stateRef = useRef<BriefingState>('idle');
  // Set when a segment's onDone/onError lands while paused — the utterance is
  // already dead, so resume() must continue the chain from that index instead
  // of re-speaking or natively resuming nothing.
  const pendingRef = useRef<number | null>(null);

  const setStatus = useCallback((s: BriefingState) => {
    stateRef.current = s;
    setState(s);
  }, []);

  const speakAt = useCallback(
    (i: number, gen: number) => {
      const segs = segmentsRef.current;
      indexRef.current = i;
      setIndex(i);
      if (i >= segs.length) {
        setStatus('done');
        return;
      }
      setStatus('speaking');
      const chainTo = (next: number) => {
        if (genRef.current !== gen) return;
        if (stateRef.current === 'paused') {
          pendingRef.current = next; // finished/failed under a pause — resume() continues from here
          return;
        }
        speakAt(next, gen);
      };
      tts.speak(segs[i].text, {
        language: localeRef.current,
        onDone: () => chainTo(i + 1),
        // a failed segment is skipped rather than stalling the briefing
        onError: () => chainTo(i + 1),
      });
    },
    [setStatus],
  );

  const stop = useCallback(() => {
    genRef.current += 1;
    pendingRef.current = null;
    tts.stop();
    segmentsRef.current = [];
    indexRef.current = 0;
    setSegments([]);
    setIndex(0);
    setStatus('idle');
  }, [setStatus]);

  const start = useCallback(async () => {
    stop(); // interrupt any current speech and take a fresh generation
    const gen = genRef.current;
    const now = new Date();
    const locale = getNativePickerLocale(language);
    const use24h = resolveUse24h(timeFormat, locale);
    try {
      const dayStart = dayjs(day).startOf('day').valueOf();
      const isToday = dayjs(day).isSame(now, 'day');
      const events = (await readUpcomingEvents(0, day)).filter(
        // an event is out only if it both started and ended before this day —
        // zero-duration all-day tasks (dtstart === dtend === day start) belong to it;
        // finished events are dropped only when briefing today
        (e) =>
          (e.dtend.getTime() > dayStart || e.dtstart.getTime() >= dayStart) &&
          (!isToday || e.allDay || e.dtend.getTime() > now.getTime()),
      );
      if (genRef.current !== gen) return; // a newer start()/stop() superseded this run
      const voice = briefingVoiceLocale(locale); // voice must match the generated text language
      localeRef.current = voice;
      const segs = buildText(events, { locale, use24h, now, day });
      if (!segs.length) {
        const msg = isToday
          ? t('briefing.emptyDay')
          : t('briefing.emptyDayDated', { date: briefingDayLabel(day, language) });
        // the empty-day line is translated — it takes the app voice, not `voice`
        tts.speak(msg, { language: locale });
        setStatus('done');
        return;
      }
      segmentsRef.current = segs;
      setSegments(segs);
      speakAt(0, gen);
    } catch (e) {
      if (__DEV__) console.warn('[briefing] start failed', e);
      if (genRef.current === gen) stop(); // don't stomp a newer run
    }
  }, [day, language, timeFormat, buildText, t, stop, speakAt, setStatus]);

  const next = useCallback(() => {
    const gen = ++genRef.current; // invalidate the current segment's pending onDone
    pendingRef.current = null;
    tts.stop();
    speakAt(indexRef.current + 1, gen);
  }, [speakAt]);

  const pause = useCallback(() => {
    if (stateRef.current !== 'speaking') return;
    if (Platform.OS === 'android') {
      // Speech.pause() doesn't exist on Android — halt the utterance instead.
      // stop() fires onStopped (not wired), so the chain and index survive.
      tts.stop();
    } else {
      tts.pause();
    }
    setStatus('paused');
  }, [setStatus]);

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending != null) {
      speakAt(pending, genRef.current); // the paused utterance had already finished/failed
      return;
    }
    if (Platform.OS === 'android') {
      speakAt(indexRef.current, genRef.current); // re-speak the interrupted segment
      return;
    }
    tts.resume();
    setStatus('speaking');
  }, [setStatus, speakAt]);

  useEffect(() => {
    const onAppState = (status: AppStateStatus) => {
      if (status === 'background') stop();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      sub.remove();
      genRef.current += 1;
      pendingRef.current = null;
      tts.stop();
    };
  }, [stop]);

  return { state, index, segments, start, pause, resume, next, stop };
}
