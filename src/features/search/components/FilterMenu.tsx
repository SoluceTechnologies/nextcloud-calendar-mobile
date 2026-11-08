import React, { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  AlignLeft,
  CalendarClock,
  CalendarDays,
  History,
  MapPin,
  SlidersHorizontal,
  Type,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react-native';

import { IconButton, Item, List, SectionHeader, Stack, Typography } from '@/ui/components';
import type { RecentSearch } from '@/stores/recentSearchStore';
import type { FilterKey, SearchModel } from '../searchModel';
import { TokenPill } from './TokenPill';

export const MAIN_FILTERS: FilterKey[] = ['calendar', 'attendee', 'date'];
const MORE_FILTERS: FilterKey[] = ['title', 'location', 'description'];

const ICONS: Record<FilterKey, LucideIcon> = {
  calendar: CalendarDays,
  attendee: Users,
  date: CalendarClock,
  title: Type,
  location: MapPin,
  description: AlignLeft,
};

const HINT_WORD: Record<FilterKey, string> = {
  calendar: 'name',
  attendee: 'person',
  date: 'name',
  title: 'text',
  location: 'text',
  description: 'text',
};

export type FilterMenuProps = {
  recent: RecentSearch[];
  onStart: (key: FilterKey) => void;
  onLoadRecent: (entry: RecentSearch) => void;
  onRemoveRecent: (entry: RecentSearch) => void;
};

export function FilterMenu({ recent, onStart, onLoadRecent, onRemoveRecent }: FilterMenuProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [showMore, setShowMore] = useState(false);
  const keys = showMore ? [...MAIN_FILTERS, ...MORE_FILTERS] : MAIN_FILTERS;

  return (
    <>
      <Stack hAlign="stretch">
        <SectionHeader title={t('search.filters')} />
        <List>
          {keys.map((key) => {
            const Icon = ICONS[key];
            const syntax = key === 'date' ? 'date: today' : `${key}: ${t(`search.hint.${HINT_WORD[key]}`)}`;
            return (
              <Item
                key={key}
                testID={`filter-${key}`}
                leading={<Icon size={20} color={colors.textSecondary} />}
                title={t(`search.filter.${key}`)}
                trailing={
                  <Typography variant="caption" color="secondary" style={styles.mono}>
                    {syntax}
                  </Typography>
                }
                onPress={() => onStart(key)}
              />
            );
          })}
          {showMore ? null : (
            <Item
              testID="filter-more"
              leading={<SlidersHorizontal size={20} color={colors.textSecondary} />}
              title={t('search.more')}
              description={t('search.moreHint')}
              onPress={() => setShowMore(true)}
            />
          )}
        </List>
      </Stack>

      {recent.length > 0 ? (
        <Stack hAlign="stretch" style={styles.section}>
          <SectionHeader title={t('search.recent')} />
          <List>
            {recent.map((entry) => (
              <Item
                key={entry.id}
                testID={`recent-${entry.term}`}
                leading={<History size={20} color={colors.textSecondary} />}
                title={<ModelPreview model={entry.model} />}
                trailing={
                  <IconButton
                    variant="plain"
                    size={32}
                    accessibilityRole="button"
                    accessibilityLabel={t('search.removeRecent')}
                    onPress={() => onRemoveRecent(entry)}
                  >
                    <X size={16} color={colors.textTertiary} />
                  </IconButton>
                }
                accessibilityActions={[{ name: 'delete', label: t('search.removeRecent') }]}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'delete') onRemoveRecent(entry);
                }}
                onPress={() => onLoadRecent(entry)}
              />
            ))}
          </List>
        </Stack>
      ) : null}
    </>
  );
}

function ModelPreview({ model }: { model: SearchModel }) {
  return (
    <View style={styles.preview}>
      {model.segments.map((segment, index) =>
        segment.kind === 'text' ? (
          <Typography key={`text-${index}`} variant="caption">
            {segment.text}
          </Typography>
        ) : (
          <TokenPill key={segment.token.id} token={segment.token} />
        ),
      )}
      {model.input ? <Typography variant="caption">{model.input}</Typography> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), letterSpacing: 0 },
  section: { marginTop: 24 },
  preview: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
