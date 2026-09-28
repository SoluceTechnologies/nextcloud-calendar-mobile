import React from 'react';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from 'expo-router';

import { Icon, Item } from '@/ui/components';

interface Props {
  title: string;
  description?: string;
  color?: string;
  icon: React.ReactNode;
  onPress: () => void;
  testID?: string;
}

function SettingsLinkImpl({ title, description, color, icon, onPress, testID }: Props) {
  const { colors } = useTheme();

  return (
    <Item
      testID={testID}
      onPress={onPress}
      leading={<Icon color={color ?? colors.primary} size={20}>{icon}</Icon>}
      title={title}
      description={description}
      trailing={<ChevronRight size={20} color={colors.textTertiary} />}
    />
  );
}

export const SettingsLink = React.memo(SettingsLinkImpl);
