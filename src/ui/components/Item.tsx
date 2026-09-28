import React from 'react';
import { StyleSheet, View } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import Typography from './Typography';

interface ItemProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
  testID?: string;
}

function Item({ title, description, leading, trailing, onPress, disabled, children, testID }: ItemProps) {
  const body = children ?? (
    <View style={styles.content}>
      {typeof title === 'string' ? <Typography variant="body1">{title}</Typography> : title}
      {typeof description === 'string' ? (
        <Typography variant="caption" color="secondary">
          {description}
        </Typography>
      ) : (
        description
      )}
    </View>
  );

  const inner = (
    <View style={styles.row} testID={onPress ? undefined : testID}>
      {leading}
      {body}
      {trailing != null ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );

  if (!onPress) return inner;

  return (
    <AnimatedPressable testID={testID} onPress={onPress} disabled={disabled} scaleTo={0.98}>
      {inner}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 16,
  },
  content: { flexDirection: 'column', flex: 1, gap: 2 },
  trailing: { marginLeft: 'auto' },
});

export default React.memo(Item);
