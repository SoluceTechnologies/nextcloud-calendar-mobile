import { useCallback, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useActiveAccount } from '@/hooks/useAccounts';
import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useRecentSearchStore, type RecentSearch } from '@/stores/recentSearchStore';
import { useLocalSearch } from '@/features/search/useLocalSearch';
import { useRemoteSearch } from '@/features/search/useRemoteSearch';
import { openServerHit } from '@/features/search/openServerHit';
import { serverRequest, toServerHits, type ServerHit } from '@/features/search/serverSearch';
import { EMPTY_MODEL, isEmptyModel, reduceSearch } from '@/features/search/searchModel';
import type { Resolve, SearchAction, SearchModel } from '@/features/search/searchModel';
import { lastOpenWord, toTerm } from '@/features/search/searchSyntax';
import { buildHints, buildValueSuggestions, resolveValue } from '@/features/search/suggestions';
import { useIsOnline } from '@/services/shared/network';
import { SearchField } from '@/features/search/components/SearchField';
import { FilterMenu } from '@/features/search/components/FilterMenu';
import { FilterBar } from '@/features/search/components/FilterBar';
import { ValueSuggestions } from '@/features/search/components/ValueSuggestions';
import { SearchResults, type ServerResults } from '@/features/search/components/SearchResults';
import { createNavigationGuard } from '@/utils/navigationGuard';
import type { CalendarEvent } from '@/types';
import { ScreenHeader, ViewContainer } from '@/ui/components';

type Dispatched = { action: SearchAction; resolve: Resolve };

const NO_RECENT: RecentSearch[] = [];

function reducer(model: SearchModel, { action, resolve }: Dispatched): SearchModel {
  return reduceSearch(model, action, resolve);
}

function useIsSelectedTab(): boolean {
  const navigation = useNavigation();
  const { key } = useRoute();
  const isSelected = () => {
    const state = navigation.getState();
    return state?.routes[state.index]?.key === key;
  };
  return useSyncExternalStore((onChange) => navigation.addListener('state', onChange), isSelected, isSelected);
}

export default function SearchScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const selected = useIsSelectedTab();
  const accountId = useAccountStore((state) => state.activeAccountId);
  const account = useActiveAccount(accountId);
  const hiddenCalendarIds = useCalendarStore((state) => state.hiddenCalendarIds);
  const online = useIsOnline();
  const navGuard = useRef(createNavigationGuard()).current;
  const [openingHref, setOpeningHref] = useState<string | null>(null);

  const [model, dispatch] = useReducer(reducer, EMPTY_MODEL);
  const local = useLocalSearch(selected ? accountId : null, toTerm(model));
  const data = local.suggestionData;
  const resolve = useCallback<Resolve>((key, raw) => resolveValue(key, raw, data), [data]);
  const send = useCallback((action: SearchAction) => dispatch({ action, resolve }), [resolve]);

  const request = useMemo(() => serverRequest(local.query, Date.now()), [local.query]);
  const remote = useRemoteSearch(selected ? accountId : null, request);
  const server = useMemo<ServerResults>(() => {
    if (!request || !account) return { hits: [], loading: false, failed: false };
    const hits = toServerHits(remote.entries, {
      baseUrl: account.baseUrl,
      calendars: local.calendars,
      hiddenCalendarIds,
      knownHrefs: local.matchedHrefs,
      query: local.query,
    });
    return { hits, loading: remote.loading, failed: remote.failed };
  }, [request, account, remote, local.calendars, local.matchedHrefs, local.query, hiddenCalendarIds]);

  const recent = useRecentSearchStore((state) => (accountId ? state.byAccount[accountId] ?? NO_RECENT : NO_RECENT));
  const addRecent = useRecentSearchStore((state) => state.add);
  const removeRecent = useRecentSearchStore((state) => state.remove);
  const remember = () => {
    if (accountId) addRecent(accountId, model);
  };

  const openEvent = (event: CalendarEvent) => {
    remember();
    navGuard(() => router.push(`/event/${encodeURIComponent(event.uid)}`));
  };

  const openHit = async (hit: ServerHit) => {
    if (!account || openingHref) return;
    remember();
    setOpeningHref(hit.href);
    try {
      const uid = await openServerHit(account, hit);
      navGuard(() => router.push(`/event/${encodeURIComponent(uid)}`));
    } catch {
      Alert.alert(t('search.openFailed'));
    } finally {
      setOpeningHref(null);
    }
  };

  const tokens = model.segments.flatMap((segment) => (segment.kind === 'token' ? [segment.token] : []));
  const typedWord = model.pending ? '' : (lastOpenWord(model.input)?.text ?? '');
  const hints = buildHints(typedWord, data, tokens);

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader title={t('search.title')} />

        <View style={styles.filterSection}>
          <SearchField
            model={model}
            onChangeInput={(text) => send({ type: 'input', text })}
            onBackspaceEmpty={() => send({ type: 'backspaceEmpty' })}
            onSubmit={() => {
              if (model.pending) {
                send({ type: 'commitRaw' });
                return;
              }
              remember();
              Keyboard.dismiss();
            }}
            onBlur={() => {
              if (model.pending !== 'date' && model.input.trim()) send({ type: 'commitRaw' });
            }}
            onSelectToken={(id) => send({ type: 'select', id })}
            onRemoveToken={(id) => send({ type: 'remove', id })}
            onClear={() => send({ type: 'clear' })}
          />
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {model.pending ? (
            <ValueSuggestions
              account={account}
              pending={model.pending}
              typed={model.input}
              suggestions={buildValueSuggestions(model.pending, model.input, data)}
              onPick={(resolved) => send({ type: 'commit', resolved })}
              onUseTyped={() => send({ type: 'commitRaw' })}
            />
          ) : isEmptyModel(model) ? (
            <FilterMenu
              recent={recent}
              onStart={(key) => send({ type: 'startFilter', key })}
              onLoadRecent={(entry) => send({ type: 'load', model: entry.model })}
              onRemoveRecent={(entry) => {
                if (accountId) removeRecent(accountId, entry.id);
              }}
            />
          ) : (
            <>
              <FilterBar
                hints={hints}
                onStart={(key) => send({ type: 'startFilter', key })}
                onHint={(hint) =>
                  send({
                    type: 'replaceLastWord',
                    key: hint.key,
                    resolved: { value: hint.value, label: hint.label, color: hint.color },
                  })
                }
              />
              <SearchResults
                local={local}
                server={server}
                offline={!online}
                openingHref={openingHref}
                onOpenEvent={openEvent}
                onOpenServerHit={(hit) => void openHit(hit)}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterSection: { paddingHorizontal: 16, marginBottom: 8 },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
});
