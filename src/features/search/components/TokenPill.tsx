import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react-native';

import { Typography } from '@/ui/components';
import type { Token } from '../searchModel';

export type TokenPillProps = {
  token: Pick<Token, 'key' | 'value' | 'label' | 'color'>;
  selected?: boolean;
  onPress?: () => void;
  onRemove?: () => void;
};

export function TokenPill({ token, selected = false, onPress, onRemove }: TokenPillProps) {
  const { t } = useTranslation();
  const { colors, radius } = useTheme();
  const textColor = selected ? colors.primaryText : colors.text;
  const name = `${token.key}: ${token.label}`;
  const style = [
    styles.pill,
    {
      borderRadius: radius.sm,
      backgroundColor: selected ? colors.primary : colors.chip,
      borderColor: selected ? colors.primary : colors.border,
    },
  ];

  const body = (
    <>
      <Typography variant="caption" weight="600" color={textColor}>{`${token.key}:`}</Typography>
      {token.color ? <View style={[styles.dot, { backgroundColor: token.color }]} /> : null}
      <Typography variant="caption" color={textColor} numberOfLines={1} style={styles.label}>
        {token.label}
      </Typography>
      {selected && onRemove ? (
        <Pressable
          testID={`token-remove-${token.key}-${token.value}`}
          accessibilityRole="button"
          accessibilityLabel={t('search.removeFilter', { filter: name })}
          hitSlop={8}
          onPress={onRemove}
        >
          <X size={14} color={textColor} />
        </Pressable>
      ) : null}
    </>
  );

  if (!onPress) return <View style={style}>{body}</View>;

  return (
    <Pressable
      testID={`token-${token.key}-${token.value}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      accessibilityActions={
        selected && onRemove ? [{ name: 'delete', label: t('search.removeFilter', { filter: name }) }] : undefined
      }
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'delete') onRemove?.();
      }}
      onPress={onPress}
      style={style}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 240,
    borderWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { flexShrink: 1 },
});
