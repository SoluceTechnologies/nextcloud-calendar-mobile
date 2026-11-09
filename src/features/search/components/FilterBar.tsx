import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';

import { Chip, Typography } from '@/ui/components';
import type { FilterKey } from '../searchModel';
import type { Suggestion } from '../suggestions';
import { MAIN_FILTERS } from './FilterMenu';
import { TokenPill } from './TokenPill';

export type FilterBarProps = {
  hints: Suggestion[];
  onStart: (key: FilterKey) => void;
  onHint: (hint: Suggestion) => void;
};

export function FilterBar({ hints, onStart, onHint }: FilterBarProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.row}
      >
        {MAIN_FILTERS.map((key) => (
          <Chip key={key} small rounded icon={<Plus size={14} color={colors.primary} />} onPress={() => onStart(key)}>
            {t(`search.short.${key}`)}
          </Chip>
        ))}
      </ScrollView>
      {hints.length > 0 ? (
        <View style={styles.hints}>
          <Typography variant="caption" color="secondary">
            {t('search.filterHint')}
          </Typography>
          {hints.map((hint) => (
            <Pressable
              key={`${hint.key}-${hint.value}`}
              testID={`hint-${hint.key}-${hint.value}`}
              accessibilityRole="button"
              accessibilityLabel={`${hint.key}: ${hint.label}`}
              onPress={() => onHint(hint)}
            >
              <TokenPill token={hint} />
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10, marginBottom: 8 },
  row: { gap: 8 },
  hints: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
});
