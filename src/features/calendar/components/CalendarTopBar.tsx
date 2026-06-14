import { memo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { styles } from '@/styles/calendarScreen';
import { useTheme } from '@/hooks/useTheme';
import type { ViewMode } from '@/types';
import { VIEW_MODES, VIEW_LABELS } from '../constants';

interface Props {
  headerTitle: string;
  isToday: boolean;
  viewMode: ViewMode;
  onOpenDrawer: () => void;
  onToday: () => void;
  onSwitchMode: (mode: ViewMode) => void;
}

function CalendarTopBarImpl({ headerTitle, isToday, viewMode, onOpenDrawer, onToday, onSwitchMode }: Props) {
  const theme = useTheme();

  return (
    <SafeAreaView
      edges={['top']}
      style={[styles.headerWrap, { backgroundColor: theme.headerBackground, borderBottomColor: theme.border }]}
    >
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={onOpenDrawer} style={styles.hamburger}>
          <Text style={[styles.hamburgerIcon, { color: theme.primary }]}>☰</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
          {headerTitle}
        </Text>
        <TouchableOpacity
          style={[styles.todayBtn, { opacity: isToday ? 0.35 : 1 }]}
          onPress={onToday}
          disabled={isToday}
        >
          <Text style={[styles.todayBtnText, { color: theme.primary }]}>Today</Text>
        </TouchableOpacity>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modePills}>
        {VIEW_MODES.map((mode) => (
          <TouchableOpacity
            key={mode}
            style={[
              styles.modeBtn,
              { backgroundColor: theme.chip },
              viewMode === mode && { backgroundColor: theme.chipActive },
            ]}
            onPress={() => onSwitchMode(mode)}
          >
            <Text
              style={[
                styles.modeBtnText,
                { color: theme.textSecondary },
                viewMode === mode && { color: theme.primaryText, fontWeight: '600' },
              ]}
            >
              {VIEW_LABELS[mode]}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

export const CalendarTopBar = memo(CalendarTopBarImpl);
