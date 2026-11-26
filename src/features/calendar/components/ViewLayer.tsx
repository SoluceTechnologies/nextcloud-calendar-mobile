import { memo } from 'react';
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
  return (
    <View
      {...rest}
      collapsable={false}
      style={[StyleSheet.absoluteFill, visibilityStyle(visible), style]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/*
        Hidden layers keep their React tree alive so switching views is instant,
        but freezing them stops every re-render/layout recompute while invisible
        (React keeps the last committed frame, which is exactly what we want to
        show again on unfreeze). As a side effect, a layer that was never shown
        does not mount at all until first revealed.
      */}
      <Freeze freeze={!visible}>{children}</Freeze>
    </View>
  );
}

export const ViewLayer = memo(ViewLayerImpl);
