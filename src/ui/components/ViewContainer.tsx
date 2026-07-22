import React from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';
import { useTheme } from 'expo-router';

const MAX_CONTENT_WIDTH = 700;

interface Props extends ViewProps {
  centered?: boolean;
}

function ViewContainer({ children, style, centered, ...rest }: Props) {
  const { colors } = useTheme();
  return (
    <View {...rest} style={[styles.root, { backgroundColor: colors.background }, style]}>
      {centered ? <View style={styles.centered}>{children}</View> : children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
});

export default React.memo(ViewContainer);
