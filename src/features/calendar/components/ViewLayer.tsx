import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { View, StyleSheet, Platform, type ViewProps, type ViewStyle } from 'react-native';
import { yieldToUI } from '@/utils/scheduling';

const HIDDEN_LAYER_MOUNT_MAX_WAIT_MS = 2000;

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
  const [mounted, setMounted] = useState(visible);
  const heldChildren = useRef<ReactNode>(null);
  const renderedMounted = useRef(false);

  if (visible || (mounted && !renderedMounted.current)) heldChildren.current = children;
  renderedMounted.current = mounted || visible;

  useEffect(() => {
    if (mounted || visible) return;
    let alive = true;
    void yieldToUI(HIDDEN_LAYER_MOUNT_MAX_WAIT_MS).then(() => {
      if (alive) setMounted(true);
    });
    return () => { alive = false; };
  }, [mounted, visible]);

  return (
    <View
      {...rest}
      collapsable={false}
      style={[StyleSheet.absoluteFill, visibilityStyle(visible), style]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {heldChildren.current}
    </View>
  );
}

export const ViewLayer = memo(ViewLayerImpl);
