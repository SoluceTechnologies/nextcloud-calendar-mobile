import { memo } from 'react';
import { FlexAlignType, StyleProp, ViewProps, ViewStyle, DimensionValue } from 'react-native';
import Reanimated, { LinearTransition } from 'react-native-reanimated';
import { useTheme } from 'expo-router';


type Direction = 'vertical' | 'horizontal';
type Alignment = 'start' | 'center' | 'end' | 'stretch';

export interface StackProps extends ViewProps {
  direction?: Direction;
  gap?: number;
  padding?: number | [number, number];
  margin?: number;
  width?: DimensionValue;
  height?: DimensionValue;
  vAlign?: Alignment;
  hAlign?: Alignment;
  inline?: boolean;
  flex?: boolean;
  backgroundColor?: string;
  radius?: number;
  card?: boolean;
  bordered?: boolean;
  flat?: boolean;
  noShadow?: boolean;
  animated?: boolean;
  borderColor?: string;
  borderWidth?: number;
  style?: StyleProp<ViewStyle>;
}

const ALIGN_ITEMS: Record<Alignment, FlexAlignType> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
};
const JUSTIFY: Record<Alignment, ViewStyle['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'flex-start',
};

function Stack({
  direction = 'vertical',
  gap = 4,
  padding = 0,
  margin = 0,
  width,
  height,
  vAlign = 'start',
  hAlign,
  inline = false,
  flex = false,
  backgroundColor,
  radius = 0,
  card = false,
  bordered = false,
  flat = false,
  noShadow = false,
  animated = false,
  borderColor,
  borderWidth,
  style,
  children,
  ...rest
}: StackProps) {
  const { colors, radius: rTokens } = useTheme();

  const resolvedHAlign = hAlign ?? (direction === 'vertical' ? 'stretch' : 'start');

  const dynamic: ViewStyle = {
    flexDirection: direction === 'vertical' ? 'column' : 'row',
    gap,
    margin,
    height,
    padding: Array.isArray(padding) ? undefined : padding,
    paddingHorizontal: Array.isArray(padding) ? padding[0] : undefined,
    paddingVertical: Array.isArray(padding) ? padding[1] : undefined,
    alignItems: ALIGN_ITEMS[resolvedHAlign],
    justifyContent: JUSTIFY[vAlign],
  };

  if (width !== undefined) {
    dynamic.width = width;
  } else if (inline) {
    dynamic.width = 'auto';
    dynamic.alignSelf = 'center';
  } else {
    dynamic.alignSelf = 'stretch';
  }

  if (inline) {
    dynamic.flex = flex ? 1 : 0;
  } else if (flex) {
    dynamic.flex = 1;
  }

  if (radius > 0) dynamic.borderRadius = radius;
  if (backgroundColor) dynamic.backgroundColor = backgroundColor;

  if (card) {
    dynamic.borderRadius = radius || rTokens.md;
    dynamic.backgroundColor = backgroundColor || colors.item;
    dynamic.borderColor = colors.border;
    dynamic.borderWidth = 1;
    if (!noShadow && !flat) {
      dynamic.shadowColor = '#000000';
      dynamic.shadowOffset = { width: 0, height: 0 };
      dynamic.shadowOpacity = 0.16;
      dynamic.shadowRadius = 1.5;
    }
  } else if (bordered) {
    dynamic.borderRadius = radius || rTokens.lg;
    dynamic.backgroundColor = backgroundColor || colors.card;
    dynamic.borderColor = `${colors.border}33`;
    dynamic.borderWidth = 1;
  }

  if (borderColor !== undefined) dynamic.borderColor = borderColor;
  if (borderWidth !== undefined) dynamic.borderWidth = borderWidth;

  return (
    <Reanimated.View
      {...rest}
      style={[dynamic, style]}
      layout={animated ? LinearTransition : undefined}
    >
      {children}
    </Reanimated.View>
  );
}

export default memo(Stack);
