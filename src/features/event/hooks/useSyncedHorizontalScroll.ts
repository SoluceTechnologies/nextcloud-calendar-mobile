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

export function useSyncedHorizontalScroll(): UseSyncedHorizontalScrollResult {
  const headerScrollRef = useRef<ScrollView>(null);
  const gridScrollRef = useRef<ScrollView>(null);
  const syncingScroll = useRef(false);

  const scrollBothTo = useCallback((x: number) => {
    syncingScroll.current = true;
    headerScrollRef.current?.scrollTo({ x, animated: false });
    gridScrollRef.current?.scrollTo({ x, animated: false });
    syncingScroll.current = false;
  }, []);

  const sync = useCallback((source: 'header' | 'grid', x: number) => {
    if (syncingScroll.current) return;
    syncingScroll.current = true;
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
