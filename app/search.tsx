import { useDeferredValue, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';

dayjs.extend(localizedFormat);

import { useAccountStore } from '@/stores/accountStore';
import { useCalendarStore } from '@/stores/calendarStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useAllEvents } from '@/database/useEvents';
import { searchEvents } from '@/features/search/searchEvents';
import {
  IconButton,
  Item,
  ScreenHeader,
  TextField,
  Typography,
  ViewContainer,
} from '@/ui/components';
import type { CalendarEvent } from '@/types';

function formatResultDate(e: CalendarEvent, language: string, allDayLabel: string): string {
  const start = dayjs(e.dtstart).locale(language);
  const datePart = start.format('ll');
  if (e.allDay) return `${datePart} · ${allDayLabel}`;
  const timePart = start.format('LT');
  return `${datePart} · ${timePart}`;
}

export default function SearchScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const language = useSettingsStore((s) => s.language);
  const activeAccountId = useAccountStore((s) => s.activeAccountId);
  const hiddenCalendarIds = useCalendarStore((s) => s.hiddenCalendarIds);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const events = useAllEvents(activeAccountId);

  const results = useMemo(() => {
    const visible = events.filter((e) => !hiddenCalendarIds.includes(e.calendarId));
    return searchEvents(visible, deferredQuery);
  }, [events, hiddenCalendarIds, deferredQuery]);

  const trimmed = query.trim();
  const allDayLabel = t('calendar.allDay');

  return (
    <ViewContainer>
      <SafeAreaView edges={['top']} style={styles.flex}>
        <ScreenHeader title={t('search.title')} onBack={() => router.back()} />

        <View style={styles.fieldWrap}>
          <TextField
            value={query}
            onChangeText={setQuery}
            placeholder={t('search.placeholder')}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            accessibilityLabel={t('search.placeholder')}
            right={
              trimmed.length > 0 ? (
                <IconButton
                  variant="plain"
                  size={32}
                  onPress={() => setQuery('')}
                  accessibilityLabel={t('search.clear')}
                >
                  <X size={18} color={colors.textSecondary} />
                </IconButton>
              ) : (
                <Search size={18} color={colors.textSecondary} />
              )
            }
          />
        </View>

        <FlatList
          data={results}
          keyExtractor={(item) => `${item.calendarId}|${item.uid}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Item
              onPress={() => router.push(`/event/${encodeURIComponent(item.uid)}`)}
              leading={<View style={[styles.dot, { backgroundColor: item.color }]} />}
              title={
                <Typography variant="body1" numberOfLines={1}>
                  {item.summary || t('calendar.noTitle')}
                </Typography>
              }
              description={formatResultDate(item, language, allDayLabel)}
            />
          )}
          ListEmptyComponent={
            <Typography variant="body2" color="secondary" align="center" style={styles.empty}>
              {trimmed.length === 0 ? t('search.hint') : t('search.noResults')}
            </Typography>
          }
        />
      </SafeAreaView>
    </ViewContainer>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fieldWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingBottom: 24 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  empty: { marginTop: 48, paddingHorizontal: 32 },
});
