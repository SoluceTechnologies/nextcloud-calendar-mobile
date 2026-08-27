import { useCallback, useEffect, useState } from 'react';

import {
  IcsImportError,
  parseIcsToEvents,
  readIcsUri,
  sanitizeIcs,
} from '@/features/event/utils/icsImport';
import type { CalendarEvent } from '@/types';

export interface UseImportIcsResult {
  loading: boolean;
  error: string | null;
  events: CalendarEvent[];
  originalIcs: string;
  reload: () => void;
}

export function useImportIcs(uri: string | undefined): UseImportIcsResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

    try {
      const raw = await readIcsUri(uri);
      const sanitized = sanitizeIcs(raw);
      setOriginalIcs(sanitized);
      const parsed = parseIcsToEvents(sanitized);
      setEvents(parsed);
    } catch (err) {
      setError(err instanceof IcsImportError ? err.message : 'Unknown import error');
    } finally {
      setLoading(false);
    }
  }, [uri]);

  useEffect(() => {
    void load();
  }, [load]);

  return { loading, error, events, originalIcs, reload: load };
}
