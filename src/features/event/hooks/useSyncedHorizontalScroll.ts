import { useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import type { ScrollView } from 'react-native';

export interface UseSyncedHorizontalScrollResult {
  headerScrollRef: RefObject<ScrollView | null>;
  gridScrollRef: RefObject<ScrollView | null>;
  scrollBothTo: (x: number) => void;
  onHeaderScroll: (x: number) => void;
  onGridScroll: (x: number) => void;
}

const SCROLL_EPSILON = 1;

export function useSyncedHorizontalScroll(): UseSyncedHorizontalScrollResult {
  const headerScrollRef = useRef<ScrollView>(null);
  const gridScrollRef = useRef<ScrollView>(null);
  const syncingScroll = useRef(false);
  const programmaticScroll = useRef<{ header: number | null; grid: number | null }>({
    header: null,
    grid: null,
  });

  const scrollBothTo = useCallback((x: number) => {
    syncingScroll.current = true;
    programmaticScroll.current = { header: x, grid: x };
    headerScrollRef.current?.scrollTo({ x, animated: false });
    gridScrollRef.current?.scrollTo({ x, animated: false });
    syncingScroll.current = false;
  }, []);

  const sync = useCallback((source: 'header' | 'grid', x: number) => {
    if (syncingScroll.current) return;
    const target = programmaticScroll.current[source];
    if (target !== null && Math.abs(x - target) < SCROLL_EPSILON) {
      programmaticScroll.current[source] = null;
      return;
    }
    syncingScroll.current = true;
    programmaticScroll.current[source === 'header' ? 'grid' : 'header'] = x;
    if (source === 'header') {
      gridScrollRef.current?.scrollTo({ x, animated: false });
    } else {
      headerScrollRef.current?.scrollTo({ x, animated: false });
    }
    syncingScroll.current = false;
  }, []);

  const onHeaderScroll = useCallback((x: number) => {
    sync('header', x);
  }, [sync]);

  const onGridScroll = useCallback((x: number) => {
    sync('grid', x);
  }, [sync]);

  return { headerScrollRef, gridScrollRef, scrollBothTo, onHeaderScroll, onGridScroll };
}
