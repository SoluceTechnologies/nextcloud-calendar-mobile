import React from 'react';
import {
  registerWidgetTaskHandler,
  requestWidgetUpdate,
  type WidgetTaskHandlerProps,
  FlexWidget,
  ListWidget,
  TextWidget,
} from 'react-native-android-widget';

import type { AgendaEventItem, AgendaSnapshot, AgendaTimelineEntry, MonthWidgetSnapshot, WidgetSurface } from '../../core/types';
import { type AgendaGroup, agendaGroups, agendaHeader, agendaPalette, compactEvents, emptyLabel } from '../../core/agendaView';
import { onEventColor, widgetPalette, widgetRadius, widgetSpacing, widgetType } from '../../core/theme';
import {
  readAgendaSnapshot,
  readMonthWidgetSnapshot,
  writeAgendaTimeline,
  writeMonthWidgetSnapshot,
} from '../../storage/widgetStore';
import { buildFreshTimeline } from '../../core/buildTimeline';
import { buildMonthWidgetSnapshot } from '../../core/monthSnapshot';
import { useCalendarStore } from '@/stores/calendarStore';

type Palette = ReturnType<typeof widgetPalette>;

const WIDGET_NAMES = ['CalendarSmallWidget', 'CalendarMediumWidget', 'CalendarLargeWidget', 'CalendarMonthWidget'] as const;

function compactLimit(widgetName: string): number {
  return widgetName === 'CalendarSmallWidget' ? 2 : 3;
}

function EventRow({ event }: { event: AgendaEventItem }) {
  const fg = onEventColor(event.color);
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', paddingTop: widgetSpacing.sm }}>
      <FlexWidget
        style={{
          width: 'match_parent',
          flexDirection: 'column',
          backgroundColor: event.color as `#${string}`,
          borderRadius: widgetRadius.sm,
          padding: 10,
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: event.deepLink }}
      >
        <TextWidget text={event.title} maxLines={1} style={{ fontSize: widgetType.body, fontWeight: '500', color: fg }} />
        <TextWidget text={event.timeLabel} maxLines={1} style={{ fontSize: widgetType.time, color: fg, marginTop: 2 }} />
      </FlexWidget>
    </FlexWidget>
  );
}

function DayHeaderCell({ group, palette }: { group: AgendaGroup; palette: Palette }) {
  return (
    <FlexWidget style={{ width: 'match_parent', paddingTop: widgetSpacing.sm }}>
      <TextWidget
        text={group.header}
        maxLines={1}
        style={{ fontSize: widgetType.caption, fontWeight: '600', color: group.isToday ? palette.primary : palette.textSecondary }}
      />
    </FlexWidget>
  );
}

function EmptyState({ snapshot, palette }: { snapshot: AgendaSnapshot | null; palette: Palette }) {
  return <TextWidget text={emptyLabel(snapshot)} style={{ fontSize: widgetType.caption, color: palette.textTertiary }} />;
}

function LargeAndroidWidget({ snapshot }: { snapshot: AgendaSnapshot | null }) {
  const palette = agendaPalette(snapshot);
  const groups = agendaGroups(snapshot);

  const cells: React.ReactElement[] = [];
  for (const group of groups) {
    cells.push(<DayHeaderCell key={`h-${group.key}`} group={group} palette={palette} />);
    for (const event of group.items) {
      cells.push(<EventRow key={`${group.key}-${event.uid}-${event.startIso}`} event={event} />);
    }
  }

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.background,
        borderRadius: widgetRadius.lg,
        padding: widgetSpacing.md,
        flexDirection: 'column',
      }}
      clickAction="OPEN_APP"
    >
      {cells.length === 0 ? (
        <EmptyState snapshot={snapshot} palette={palette} />
      ) : (
        <ListWidget style={{ height: 'match_parent', width: 'match_parent' }}>{cells}</ListWidget>
      )}
    </FlexWidget>
  );
}

function CompactAndroidWidget({ snapshot, limit }: { snapshot: AgendaSnapshot | null; limit: number }) {
  const palette = agendaPalette(snapshot);
  const header = agendaHeader(snapshot);
  const events = compactEvents(snapshot, limit);

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        backgroundColor: palette.background,
        borderRadius: widgetRadius.lg,
        padding: widgetSpacing.md,
        flexDirection: 'row',
      }}
      clickAction="OPEN_APP"
    >
      <FlexWidget style={{ width: 52, alignItems: 'center' }}>
        <TextWidget text={header.dayLabel} style={{ fontSize: widgetType.caption, fontWeight: '600', color: palette.primary }} />
        <TextWidget text={header.dayNumber} style={{ fontSize: widgetType.heading, fontWeight: '700', color: palette.text }} />
      </FlexWidget>

      <FlexWidget style={{ flex: 1, paddingLeft: widgetSpacing.sm }}>
        {events.length === 0 ? (
          <EmptyState snapshot={snapshot} palette={palette} />
        ) : (
          events.map((event) => <EventRow key={`${event.uid}-${event.startIso}`} event={event} />)
        )}
      </FlexWidget>
    </FlexWidget>
  );
}

function MonthAndroidWidget({ snapshot }: { snapshot: MonthWidgetSnapshot | null }) {
  const settings = useCalendarStore.getState();
  const systemDark = snapshot?.scheme === 'dark';
  const dark = settings.monthWidgetTheme === 'dark' || (settings.monthWidgetTheme === 'system' && systemDark);

  const palette = dark
    ? {
        cardBg: '#E6121214' as const,
        cardBorder: '#444752' as const,
        gridLine: '#40434E' as const,
        titleText: '#FFFFFF' as const,
        icon: '#D0D0D5' as const,
        menuIcon: '#E0E0E0' as const,
        dowWeekday: '#9E9EA5' as const,
        dowSat: '#D8D8DC' as const,
        dowSun: '#FF6B6B' as const,
        dayCurMonth: '#FFFFFF' as const,
        dayOtherMonth: '#55555A' as const,
        todayBg: '#0082C9' as const,
        todayText: '#FFFFFF' as const,
        moreText: '#9E9EA5' as const,
      }
    : {
        cardBg: '#F4FFFFFF' as const,
        cardBorder: '#94A3B8' as const,
        gridLine: '#CBD5E1' as const,
        titleText: '#111827' as const,
        icon: '#374151' as const,
        menuIcon: '#4B5563' as const,
        dowWeekday: '#4B5563' as const,
        dowSat: '#1F2937' as const,
        dowSun: '#DC2626' as const,
        dayCurMonth: '#111827' as const,
        dayOtherMonth: '#9CA3AF' as const,
        todayBg: '#0082C9' as const,
        todayText: '#FFFFFF' as const,
        moreText: '#6B7280' as const,
      };

  const fontWeight = ({
    light: '300',
    normal: '400',
    medium: '500',
    bold: '700',
    black: '900',
  } as const)[settings.monthWidgetFontWeight];

  const cardStyle = settings.monthWidgetCardStyle;
  const currentOffset = snapshot?.monthOffset ?? 0;

  const dayUri = (date: string) =>
    settings.monthWidgetDayTap === 'newEvent'
      ? `nextcloud-calendar:///event/new?date=${encodeURIComponent(`${date}T09:00:00`)}`
      : `nextcloud-calendar:///calendar?date=${encodeURIComponent(date)}`;

  if (!snapshot) {
    return (
      <FlexWidget
        style={{
          height: 'match_parent',
          width: 'match_parent',
          padding: widgetSpacing.md,
          backgroundColor: palette.cardBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'nextcloud-calendar:///calendar' }}
      >
        <TextWidget text="Calendar" style={{ fontSize: widgetType.body, color: palette.dowWeekday }} />
      </FlexWidget>
    );
  }

  const weekDays = [
    { name: 'Mon', color: palette.dowWeekday },
    { name: 'Tue', color: palette.dowWeekday },
    { name: 'Wed', color: palette.dowWeekday },
    { name: 'Thu', color: palette.dowWeekday },
    { name: 'Fri', color: palette.dowWeekday },
    { name: 'Sat', color: palette.dowSat },
    { name: 'Sun', color: palette.dowSun },
  ];

  return (
    <FlexWidget
      style={{
        height: 'match_parent',
        width: 'match_parent',
        flexDirection: 'column',
        backgroundColor: cardStyle === 'transparent' ? '#00000000' : palette.cardBg,
        borderRadius: cardStyle === 'card' ? 20 : 0,
        borderWidth: cardStyle === 'card' ? 1 : 0,
        borderColor: cardStyle === 'card' ? palette.cardBorder : '#00000000',
      }}
    >
      {/* 1. Header Bar */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 48,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 8,
        }}
      >
        {/* Menu (☰) -> Settings */}
        <FlexWidget
          style={{
            width: 36,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'nextcloud-calendar:///settings/widgets' }}
        >
          <TextWidget
            text="☰"
            style={{
              fontSize: 19,
              fontWeight: 'bold',
              color: palette.menuIcon,
            }}
          />
        </FlexWidget>

        {/* Month Title -> Calendar App */}
        <FlexWidget
          style={{
            flex: 1,
            height: 38,
            justifyContent: 'center',
            paddingLeft: 6,
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'nextcloud-calendar:///calendar' }}
        >
          <TextWidget
            text={snapshot.monthLabel}
            maxLines={1}
            style={{
              fontSize: 16,
              fontWeight: 'bold',
              color: palette.titleText,
            }}
          />
        </FlexWidget>

        {/* Prev (❮) */}
        <FlexWidget
          style={{
            width: 34,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          clickAction="MONTH_PREV"
          clickActionData={{ offset: currentOffset - 1 }}
        >
          <TextWidget
            text="❮"
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: palette.icon,
            }}
          />
        </FlexWidget>

        {/* Today (⚲) */}
        <FlexWidget
          style={{
            width: 34,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          clickAction="MONTH_TODAY"
          clickActionData={{ offset: 0 }}
        >
          <TextWidget
            text="⚲"
            style={{
              fontSize: 17,
              fontWeight: 'bold',
              color: palette.icon,
            }}
          />
        </FlexWidget>

        {/* Next (❯) */}
        <FlexWidget
          style={{
            width: 34,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          clickAction="MONTH_NEXT"
          clickActionData={{ offset: currentOffset + 1 }}
        >
          <TextWidget
            text="❯"
            style={{
              fontSize: 15,
              fontWeight: 'bold',
              color: palette.icon,
            }}
          />
        </FlexWidget>

        {/* Add (+) */}
        <FlexWidget
          style={{
            width: 34,
            height: 38,
            justifyContent: 'center',
            alignItems: 'center',
          }}
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'nextcloud-calendar:///event/new' }}
        >
          <TextWidget
            text="+"
            style={{
              fontSize: 22,
              fontWeight: 'bold',
              color: palette.todayBg,
            }}
          />
        </FlexWidget>
      </FlexWidget>

      {/* Header divider */}
      <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: palette.gridLine }} />

      {/* 2. DOW Bar */}
      <FlexWidget
        style={{
          width: 'match_parent',
          height: 24,
          flexDirection: 'row',
          alignItems: 'center',
        }}
        clickAction="OPEN_URI"
        clickActionData={{ uri: 'nextcloud-calendar:///calendar' }}
      >
        {weekDays.map((dow) => (
          <FlexWidget
            key={dow.name}
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <TextWidget
              text={dow.name}
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: dow.color,
              }}
            />
          </FlexWidget>
        ))}
      </FlexWidget>

      {/* DOW divider */}
      <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: palette.gridLine }} />

      {/* 3. 6-Week Month Grid */}
      {Array.from({ length: 6 }, (_, week) => (
        <FlexWidget
          key={week}
          style={{
            width: 'match_parent',
            flex: 1,
            flexDirection: 'column',
          }}
        >
          {week > 0 && (
            <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: palette.gridLine }} />
          )}
          <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'row' }}>
            {snapshot.days.slice(week * 7, week * 7 + 7).map((day, colIdx) => {
              const isSunday = colIdx === 6;
              const dayNumColor = day.isToday
                ? palette.todayText
                : !day.inMonth
                ? palette.dayOtherMonth
                : isSunday
                ? palette.dowSun
                : palette.dayCurMonth;

              return (
                <FlexWidget
                  key={day.dateIso}
                  style={{
                    flex: 1,
                    height: 'match_parent',
                    backgroundColor: day.isToday ? palette.todayBg : '#00000000',
                    borderRightWidth: colIdx < 6 ? 1 : 0,
                    borderColor: palette.gridLine,
                    padding: 2,
                    flexDirection: 'column',
                  }}
                  clickAction="OPEN_URI"
                  clickActionData={{ uri: dayUri(day.dateIso) }}
                >
                  {/* Day Number */}
                  <TextWidget
                    text={day.dayNumber}
                    style={{
                      fontSize: 11,
                      fontWeight: day.isToday ? 'bold' : fontWeight,
                      color: dayNumColor,
                      paddingLeft: 1,
                    }}
                  />

                  {/* Events */}
                  <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column', marginTop: 1 }}>
                    {day.events.slice(0, 3).map((event) => (
                      <TextWidget
                        key={event.uid}
                        text={event.title}
                        maxLines={1}
                        style={{
                          fontSize: 8,
                          fontWeight: '500',
                          color: day.isToday ? '#FFFFFF' : (event.color as `#${string}`),
                          marginTop: 1,
                        }}
                      />
                    ))}
                    {(day.totalEvents ?? day.events.length) > 3 && (
                      <TextWidget
                        text={`+${(day.totalEvents ?? day.events.length) - 3}`}
                        style={{
                          fontSize: 7,
                          fontWeight: 'bold',
                          color: day.isToday ? '#E0F2FE' : palette.moreText,
                        }}
                      />
                    )}
                  </FlexWidget>
                </FlexWidget>
              );
            })}
          </FlexWidget>
        </FlexWidget>
      ))}
    </FlexWidget>
  );
}

function AndroidWidget({
  widgetName, snapshot, monthSnapshot,
}: {
  widgetName: string;
  snapshot: AgendaSnapshot | null;
  monthSnapshot: MonthWidgetSnapshot | null;
}) {
  if (widgetName === 'CalendarMonthWidget') {
    return <MonthAndroidWidget snapshot={monthSnapshot} />;
  }
  if (widgetName === 'CalendarLargeWidget') {
    return <LargeAndroidWidget snapshot={snapshot} />;
  }
  return <CompactAndroidWidget snapshot={snapshot} limit={compactLimit(widgetName)} />;
}

export const widgetTaskHandler = async (props: WidgetTaskHandlerProps) => {
  const cachedSnapshot = readAgendaSnapshot();
  let cachedMonthSnapshot = readMonthWidgetSnapshot();

  if (props.widgetAction === 'WIDGET_CLICK') {
    if (
      props.clickAction === 'MONTH_PREV' ||
      props.clickAction === 'MONTH_NEXT' ||
      props.clickAction === 'MONTH_TODAY'
    ) {
      const targetOffset = typeof props.clickActionData?.offset === 'number'
        ? props.clickActionData.offset
        : 0;

      const newMonthSnapshot = await buildMonthWidgetSnapshot(new Date(), targetOffset);
      if (newMonthSnapshot) {
        writeMonthWidgetSnapshot(newMonthSnapshot);
        props.renderWidget(
          <AndroidWidget
            widgetName={props.widgetInfo.widgetName}
            snapshot={cachedSnapshot}
            monthSnapshot={newMonthSnapshot}
          />,
        );
        return;
      }
    }
  }

  props.renderWidget(
    <AndroidWidget
      widgetName={props.widgetInfo.widgetName}
      snapshot={cachedSnapshot}
      monthSnapshot={cachedMonthSnapshot}
    />,
  );

  if (props.widgetAction === 'WIDGET_ADDED' || props.widgetAction === 'WIDGET_UPDATE') {
    try {
      const currentOffset = cachedMonthSnapshot?.monthOffset ?? 0;
      const [timeline, monthSnapshot] = await Promise.all([
        buildFreshTimeline(),
        buildMonthWidgetSnapshot(new Date(), currentOffset),
      ]);
      if (timeline && timeline.length > 0) {
        writeAgendaTimeline(timeline);
        if (monthSnapshot) {
          writeMonthWidgetSnapshot(monthSnapshot);
        }
        props.renderWidget(
          <AndroidWidget
            widgetName={props.widgetInfo.widgetName}
            snapshot={timeline[0].snapshot}
            monthSnapshot={monthSnapshot ?? cachedMonthSnapshot}
          />,
        );
      } else if (monthSnapshot) {
        writeMonthWidgetSnapshot(monthSnapshot);
      }
    } catch (error) {
      if (__DEV__) console.warn('[widget] handler refresh failed', error);
    }
  }
};

export const homeWidget: WidgetSurface<AgendaTimelineEntry[]> = {
  id: 'homeWidget',
  isSupported: () => true,
  update: async (entries) => {
    if (entries.length === 0) return;
    writeAgendaTimeline(entries);
    const snapshot = entries[0].snapshot;
    const currentMonthSnapshot = readMonthWidgetSnapshot();
    const currentOffset = currentMonthSnapshot?.monthOffset ?? 0;
    const monthSnapshot = await buildMonthWidgetSnapshot(new Date(), currentOffset);
    writeMonthWidgetSnapshot(monthSnapshot);
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: () => (
            <AndroidWidget widgetName={widgetName} snapshot={snapshot} monthSnapshot={monthSnapshot} />
          ),
        }),
      ),
    );
  },
  clear: async () => {
    writeAgendaTimeline([]);
    writeMonthWidgetSnapshot(null);
    await Promise.all(
      WIDGET_NAMES.map((widgetName) =>
        requestWidgetUpdate({
          widgetName,
          renderWidget: () => (
            <AndroidWidget widgetName={widgetName} snapshot={null} monthSnapshot={null} />
          ),
        }),
      ),
    );
  },
};

export { registerWidgetTaskHandler };
