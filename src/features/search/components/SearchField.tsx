import React, { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Search, X } from 'lucide-react-native';

import { IconButton, Typography } from '@/ui/components';
import { isEmptyModel, type SearchModel } from '../searchModel';
import { TokenPill } from './TokenPill';

export type SearchFieldProps = {
  model: SearchModel;
  onChangeInput: (text: string) => void;
  onBackspaceEmpty: () => void;
  onSubmit: () => void;
  onBlur: () => void;
  onSelectToken: (id: string) => void;
  onRemoveToken: (id: string) => void;
  onClear: () => void;
};

export function SearchField({
  model,
  onChangeInput,
  onBackspaceEmpty,
  onSubmit,
  onBlur,
  onSelectToken,
  onRemoveToken,
  onClear,
}: SearchFieldProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const empty = isEmptyModel(model);

  useEffect(() => {
    if (model.pending) inputRef.current?.focus();
  }, [model.pending]);

  return (
    <View style={[styles.field, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md }]}>
      <Search size={18} color={colors.textTertiary} />
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {model.segments.map((segment, index) =>
          segment.kind === 'text' ? (
            <Typography key={`text-${index}`} variant="caption">
              {segment.text}
            </Typography>
          ) : (
            <TokenPill
              key={segment.token.id}
              token={segment.token}
              selected={segment.token.id === model.selectedId}
              onPress={() => onSelectToken(segment.token.id)}
              onRemove={() => onRemoveToken(segment.token.id)}
            />
          ),
        )}
        {model.pending ? (
          <View testID="pending-token" style={[styles.pending, { borderColor: colors.primary, borderRadius: radius.sm }]}>
            <Typography variant="caption" weight="600" color={colors.primary}>{`${model.pending}:`}</Typography>
          </View>
        ) : null}
        <TextInput
          ref={inputRef}
          testID="search-input"
          value={model.input}
          onChangeText={onChangeInput}
          onKeyPress={(event) => {
            if (event.nativeEvent.key === 'Backspace' && model.input === '') onBackspaceEmpty();
          }}
          onSubmitEditing={onSubmit}
          onBlur={onBlur}
          submitBehavior="submit"
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel={t('search.placeholder')}
          placeholder={empty ? t('search.placeholder') : undefined}
          placeholderTextColor={colors.text + '66'}
          style={[styles.input, { color: colors.text }]}
        />
      </ScrollView>
      {empty ? null : (
        <IconButton
          variant="plain"
          size={32}
          accessibilityRole="button"
          accessibilityLabel={t('common.clear')}
          onPress={onClear}
        >
          <X size={18} color={colors.textTertiary} />
        </IconButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingLeft: 12, paddingRight: 4, minHeight: 48, gap: 8 },
  scroll: { flex: 1, maxHeight: 104 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingVertical: 8 },
  pending: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  input: { flexGrow: 1, minWidth: 80, fontSize: 15, paddingVertical: 4 },
});
