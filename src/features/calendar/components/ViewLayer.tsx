import { memo, useEffect, useState } from 'react';
import { Freeze } from 'react-freeze';
import { View, StyleSheet, Platform, type ViewProps, type ViewStyle } from 'react-native';

interface Props extends ViewProps {
  visible: boolean;
}

function visibilityStyle(visible: boolean): ViewStyle {
  if (Platform.OS === 'ios') {
    return { opacity: visible ? 1 : 0, zIndex: visible ? 1 : 0 };
  }
  return { display: visible ? 'flex' : 'none' };
}

function ViewLayerImpl({ visible, style, children, ...rest }: Props) {
  const [frozen, setFrozen] = useState(!visible);

  useEffect(() => {
    setFrozen(!visible);
  }, [visible]);

  return (
    <View
      {...rest}
      collapsable={false}
      style={[StyleSheet.absoluteFill, visibilityStyle(visible), style]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Freeze freeze={frozen && !visible}>{children}</Freeze>
    </View>
  );
}

export const ViewLayer = memo(ViewLayerImpl);
