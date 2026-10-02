import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, KeyboardAvoidingView, Keyboard, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import localizedFormat from 'dayjs/plugin/localizedFormat';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { TalkToggle } from './TalkToggle';
import { AttendeesField } from './AttendeesField';
import { requestAlertPermission } from '@/features/notifications/scheduleAlerts';
import { useSettingsStore } from '@/stores/settingsStore';
import { isWritableCalendar } from '@/utils/calendars';
import { useTimeFormat } from '@/hooks/useTimeFormat';
import { getNativePickerLocale } from '@/utils/i18n';
import { AlertPicker } from './AlertPicker';
import { RecurrencePicker } from './RecurrencePicker';
import { TimezonePicker } from './TimezonePicker';
import { isValidTimeZone, resolveAccountTimezone, wallDateToUtc, zonedUtcToWallDate } from '@/utils/timezone';
import { Stack, Typography, TextField, DateField, Button, Chip, Toggle } from '@/ui/components';
import type { CalendarMeta, Attendee, CreateEventInput, RecurrenceRule, TalkRoomType, Account } from '@/types';

dayjs.extend(localizedFormat);

interface InitialValues {
  summary?: string;
  calendarId?: string;
  allDay?: boolean;
  dtstart?: Date;
  dtend?: Date;
  description?: string;
  location?: string;
  attendees?: Attendee[];
  rrule?: RecurrenceRule;
  alarms?: number[];
  timezone?: string;
}

interface Props {
  calendars: CalendarMeta[];
  defaultDate?: Date;
  organizerEmail: string;
  organizerName: string;
  onSubmit: (input: CreateEventInput) => void;
  initialValues?: InitialValues;
  disableCalendarChange?: boolean;
  account?: Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword' | 'timezone'> | null;
}

export interface EventFormHandle {
  submit: () => void;
}

type AndroidPickerStep = null | { target: 'start' | 'end'; step: 'date' | 'time'; partial?: Date };

export const EventForm = forwardRef<EventFormHandle, Props>(function EventForm({
  calendars, defaultDate, organizerEmail, organizerName, onSubmit,
  initialValues, disableCalendarChange = false, account,
}: Props, ref) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { use24h, timeFormat, formatTime } = useTimeFormat();
  const language = useSettingsStore((s) => s.language);
  const twoColDates = useWindowDimensions().width >= 600;

  // The iOS wheel picker ignores is24Hour; its hour cycle follows the picker
  // locale's region. For an explicit 12h/24h choice we pin a matching region
  // while keeping the app language for labels. 'auto' uses the device region.
  const iosPickerLocale = timeFormat === 'auto'
    ? getNativePickerLocale(language)
    : `${language}-${use24h ? 'GB' : 'US'}`;

  const [summary, setSummary] = useState(initialValues?.summary ?? '');
  const writableCalendars = calendars.filter(isWritableCalendar);
  const storedDefault = useSettingsStore((s) =>
    account ? s.defaultCalendarByAccount[account.id] : undefined,
  );

  const defaultCalendarId =
    initialValues?.calendarId ??
    (storedDefault && writableCalendars.some((c) => c.id === storedDefault)
      ? storedDefault
      : undefined) ??
    writableCalendars.find((c) => c.slug.toLowerCase() === 'personal')?.id ??
    writableCalendars[0]?.id ?? '';
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [allDay, setAllDay] = useState(initialValues?.allDay ?? false);

  // Timed events are edited as wall-clock times in the event's own zone:
  // dtstart/dtend below hold the zone's wall time as a device-local Date, and
  // are converted back to real instants on submit. The zone defaults to the
  // event's TZID, else the effective account/device zone — never a raw
  // `account.timezone`, which may be '' and would desync fields from zone.
  const initialTimezone = (() => {
    const fromEvent = initialValues?.timezone;
    return fromEvent && isValidTimeZone(fromEvent) ? fromEvent : resolveAccountTimezone(account);
  })();
  const [timezone, setTimezone] = useState(initialTimezone);
  const asWallDate = (d: Date) =>
    initialValues?.allDay ? d : zonedUtcToWallDate(d, initialTimezone);
  const [dtstart, setDtstart] = useState(
    initialValues?.dtstart ? asWallDate(initialValues.dtstart) : (defaultDate ?? new Date())
  );
  const [dtend, setDtend] = useState(
    initialValues?.dtend
      ? asWallDate(initialValues.dtend)
      : (defaultDate ? dayjs(defaultDate).add(1, 'hour').toDate() : dayjs().add(1, 'hour').toDate())
  );
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [location, setLocation] = useState(initialValues?.location ?? '');
  const [withTalkRoom, setWithTalkRoom] = useState(false);
  const [talkRoomType, setTalkRoomType] = useState<TalkRoomType>('private');
  const [attendees, setAttendees] = useState<Attendee[]>(initialValues?.attendees ?? []);
  const [rrule, setRrule] = useState<RecurrenceRule | undefined>(initialValues?.rrule);
  const [alarms, setAlarms] = useState<number[] | undefined>(initialValues?.alarms);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [endError, setEndError] = useState<string | null>(null);

  const [androidStep, setAndroidStep] = useState<AndroidPickerStep>(null);

  const scrollRef = useRef<ScrollView>(null);
  const inputOffsets = useRef<Record<string, number>>({});

  function scrollToField(key: string) {
    const y = inputOffsets.current[key];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
  }

  function onFieldLayout(key: string, event: LayoutChangeEvent) {
    inputOffsets.current[key] = event.nativeEvent.layout.y;
  }

  // iOS embeds the native compact pickers inline; only Android opens a picker.
  function openStartPicker() {
    setAndroidStep({ target: 'start', step: 'date' });
  }

  function openEndPicker() {
    setAndroidStep({ target: 'end', step: 'date' });
  }

  const seeded = useRef(!!initialValues);

  function applyStart(d: Date) {
    if (!seeded.current) {
      seeded.current = true;
      setDtstart(d);
      setDtend(allDay ? d : dayjs(d).add(1, 'hour').toDate());
      return;
    }
    setDtstart(d);
    setDtend((prevEnd) => {
      if (allDay) return dayjs(prevEnd).isBefore(dayjs(d), 'day') ? d : prevEnd;
      return prevEnd > d ? prevEnd : dayjs(d).add(1, 'hour').toDate();
    });
    setEndError(null);
  }

  function applyEnd(d: Date) {
    seeded.current = true;
    const invalid = allDay
      ? dayjs(d).isBefore(dayjs(dtstart), 'day')
      : d <= dtstart;
    if (invalid) {
      setDtend(allDay ? dtstart : dayjs(dtstart).add(1, 'hour').toDate());
      setEndError(t('event.errorEndAfterStart'));
    } else {
      setDtend(d);
      setEndError(null);
    }
  }

  function handleIosStartChange(_: DateTimePickerEvent, d?: Date) {
    if (d) applyStart(d);
  }

  function handleIosEndChange(_: DateTimePickerEvent, d?: Date) {
    if (d) applyEnd(d);
  }

  function handleAndroidChange(_: DateTimePickerEvent, selected?: Date) {
    if (!androidStep) return;

    if (selected === undefined) {
      setAndroidStep(null);
      return;
    }

    const { target, step } = androidStep;

    if (allDay || step === 'time') {
      const base = step === 'time' && androidStep.partial ? androidStep.partial : selected;
      let finalDate: Date;
      if (step === 'time') {
        const d = new Date(androidStep.partial!);
        d.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
        finalDate = d;
      } else {
        finalDate = base;
      }
      if (target === 'start') applyStart(finalDate);
      else applyEnd(finalDate);
      setAndroidStep(null);
    } else {
      setAndroidStep({ target, step: 'time', partial: selected });
    }
  }

  function handleSubmit() {
    Keyboard.dismiss();
    setTitleError(null);
    setCalendarError(null);
    if (!summary.trim()) { setTitleError(t('event.errorTitleRequired')); return; }
    if (!calendarId) { setCalendarError(t('event.errorSelectCalendar')); return; }
    if (allDay) {
      if (dayjs(dtend).startOf('day').isBefore(dayjs(dtstart).startOf('day'))) {
        setEndError(t('event.errorEndAfterStart')); return;
      }
    } else if (dtend <= dtstart) {
      setEndError(t('event.errorEndAfterStart')); return;
    }
    const { timedAlerts, allDayAlerts } = useSettingsStore.getState();
    const willAlert = alarms === undefined
      ? (allDay ? allDayAlerts : timedAlerts).length > 0
      : alarms.length > 0;
    if (willAlert) void requestAlertPermission();

    onSubmit({
      summary: summary.trim(), calendarId,
      dtstart: allDay ? dtstart : wallDateToUtc(dtstart, timezone),
      dtend: allDay ? dtend : wallDateToUtc(dtend, timezone),
      allDay,
      description, location, attendees, withTalkRoom, talkRoomType,
      organizerEmail, organizerName, rrule, alarms,
      timezone: allDay ? undefined : timezone,
    });
  }

  useImperativeHandle(ref, () => ({ submit: handleSubmit }));

  const startBlock = (
    <View style={twoColDates ? styles.grow : undefined}>
      {Platform.OS === 'ios' ? (
        <View style={styles.iosPickerRow}>
          <Typography variant="body2" color="secondary">{t('event.start')}</Typography>
          <DateTimePicker
            value={dtstart}
            mode={allDay ? 'date' : 'datetime'}
            display="compact"
            accentColor={theme.colors.primary}
            locale={iosPickerLocale}
            onChange={handleIosStartChange}
          />
        </View>
      ) : (
        <DateField
          label={t('event.start')}
          value={dayjs(dtstart).format('ddd ll')}
          time={allDay ? undefined : formatTime(dtstart)}
          onPress={openStartPicker}
        />
      )}
    </View>
  );
  const endBlock = (
    <View style={twoColDates ? styles.grow : undefined}>
      {Platform.OS === 'ios' ? (
        <>
          <View style={styles.iosPickerRow}>
            <Typography variant="body2" color="secondary">{t('event.end')}</Typography>
            <DateTimePicker
              value={dtend}
              mode={allDay ? 'date' : 'datetime'}
              display="compact"
              accentColor={theme.colors.primary}
              locale={iosPickerLocale}
              onChange={handleIosEndChange}
            />
          </View>
          {endError ? (
            <Typography variant="caption" color="danger">{endError}</Typography>
          ) : null}
        </>
      ) : (
        <DateField
          label={t('event.end')}
          value={dayjs(dtend).format('ddd ll')}
          time={allDay ? undefined : formatTime(dtend)}
          onPress={openEndPicker}
          error={endError ?? undefined}
        />
      )}
    </View>
  );

  const androidPickerMode = androidStep?.step === 'time' ? 'time' : 'date';
  const androidPickerValue = androidStep?.step === 'time' && androidStep.partial
    ? androidStep.partial
    : androidStep?.target === 'start' ? dtstart : dtend;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
      contentInsetAdjustmentBehavior="automatic"
    >
      <Stack gap={16}>
        <View onLayout={(e) => onFieldLayout('title', e)}>
          <TextField
            label={t('event.titleLabel')}
            value={summary}
            onChangeText={(v) => { setSummary(v); if (titleError) setTitleError(null); }}
            placeholder={t('event.titlePlaceholder')}
            error={titleError ?? undefined}
            onFocus={() => scrollToField('title')}
          />
        </View>

        <Stack gap={8}>
          <Typography variant="body2" color="secondary">{t('event.calendar')}</Typography>
          {writableCalendars.length === 0 && (
            <Typography variant="caption" color="danger">{t('event.noWritableCalendars')}</Typography>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {writableCalendars.map((cal) => (
              <Chip
                key={cal.id}
                rounded
                active={calendarId === cal.id}
                activeColor={cal.color}
                disabled={disableCalendarChange}
                onPress={() => { setCalendarId(cal.id); if (calendarError) setCalendarError(null); }}
              >
                {cal.displayName}
              </Chip>
            ))}
          </ScrollView>
          {calendarError ? (
            <Typography variant="caption" color="danger">{calendarError}</Typography>
          ) : null}
          {disableCalendarChange && (
            <Typography variant="caption" color="secondary">{t('event.calendarLockedRecurring')}</Typography>
          )}
        </Stack>

        <Stack direction="horizontal" vAlign="center" hAlign="center">
          <Typography variant="body2" color="secondary">{t('event.allDay')}</Typography>
          <View style={styles.pushRight}>
            <Toggle value={allDay} onValueChange={(v) => { setAllDay(v); setEndError(null); }} />
          </View>
        </Stack>

        <Stack direction={twoColDates ? 'horizontal' : 'vertical'} gap={twoColDates ? 12 : 16}>
          {startBlock}
          {endBlock}
        </Stack>

        {!allDay && (
          <TimezonePicker value={timezone} onChange={setTimezone} />
        )}

        {Platform.OS === 'android' && androidStep !== null && (
          <DateTimePicker
            key={`android-picker-${androidStep.target}-${androidStep.step}`}
            value={androidPickerValue ?? new Date()}
            mode={androidPickerMode}
            is24Hour={use24h}
            onChange={handleAndroidChange}
          />
        )}


        <Stack
          direction={twoColDates ? 'horizontal' : 'vertical'}
          gap={twoColDates ? 12 : 16}
          hAlign="stretch"
        >
          <View style={twoColDates ? styles.grow : undefined}>
            <RecurrencePicker value={rrule} onChange={setRrule} dtstart={dtstart} allDay={allDay} />
          </View>
          <View style={twoColDates ? styles.grow : undefined}>
            <AlertPicker value={alarms} onChange={setAlarms} />
          </View>
        </Stack>

        <View onLayout={(e) => onFieldLayout('location', e)}>
          <TextField
            label={t('event.location')}
            value={location}
            onChangeText={setLocation}
            placeholder={t('event.locationPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            textContentType="none"
            onFocus={() => scrollToField('location')}
          />
        </View>

        <View onLayout={(e) => onFieldLayout('description', e)}>
          <TextField
            label={t('event.description')}
            value={description}
            onChangeText={setDescription}
            placeholder={t('event.descriptionPlaceholder')}
            multiline
            numberOfLines={3}
            style={styles.multiline}
            onFocus={() => scrollToField('description')}
          />
        </View>

        <AttendeesField
          attendees={attendees}
          onChange={setAttendees}
          account={account}
          onInputLayout={(e) => onFieldLayout('attendee', e)}
          onInputFocus={() => scrollToField('attendee')}
        />

        <TalkToggle
          value={withTalkRoom}
          onChange={setWithTalkRoom}
          roomType={talkRoomType}
          onRoomTypeChange={setTalkRoomType}
        />
      </Stack>
    </ScrollView>
    </KeyboardAvoidingView>
  );
});

const styles = StyleSheet.create({
  scroll: { flex: 1, padding: 20 },
  scrollContent: { paddingBottom: 40 },
  multiline: { height: 80, textAlignVertical: 'top' },
  chipRow: { gap: 8 },
  grow: { flex: 1 },
  pushRight: { marginLeft: 'auto' },
  iosPickerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
});
