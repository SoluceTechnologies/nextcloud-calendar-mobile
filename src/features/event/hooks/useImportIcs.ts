import { useCallback, useEffect, useState } from 'react';

import {
  parseIcsToEvents,
  readIcsUri,
  sanitizeIcs,
} from '@/features/event/utils/icsImport';
import type { CalendarEvent } from '@/types';

export type IcsImportErrorKey = 'fileError' | 'parseError';

export interface UseImportIcsResult {
  loading: boolean;
  error: IcsImportErrorKey | null;
  events: CalendarEvent[];
  originalIcs: string;
  reload: () => void;
}

export function useImportIcs(uri: string | undefined): UseImportIcsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<IcsImportErrorKey | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [originalIcs, setOriginalIcs] = useState('');

  const load = useCallback(async () => {
    if (!uri) {
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    let sanitized: string;
    try {
      sanitized = sanitizeIcs(await readIcsUri(uri));
    } catch {
      setError('fileError');
      setLoading(false);
      return;
    }

    try {
      setEvents(parseIcsToEvents(sanitized));
      setOriginalIcs(sanitized);
    } catch {
      setError('parseError');
    }
    setLoading(false);
  }, [uri]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, events, originalIcs, reload: load };
}
