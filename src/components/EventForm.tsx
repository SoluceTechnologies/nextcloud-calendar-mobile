import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ScrollView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useTheme } from '@/hooks/useTheme';
import { TalkToggle } from './TalkToggle';
import { RecurrencePicker } from './RecurrencePicker';
import type { CalendarMeta, Attendee, CreateEventInput, RecurrenceRule, TalkRoomType } from '@/types';

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
}

interface Props {
  calendars: CalendarMeta[];
  defaultDate?: Date;
  organizerEmail: string;
  organizerName: string;
  onSubmit: (input: CreateEventInput) => void;
  loading: boolean;
  initialValues?: InitialValues;
  submitLabel?: string;
  disableCalendarChange?: boolean;
}

/**
 * Android: @react-native-community/datetimepicker does not support mode="datetime".
 * We use a two-step flow: first pick the date, then pick the time.
 */
type AndroidPickerStep = null | { target: 'start' | 'end'; step: 'date' | 'time'; partial?: Date };

export function EventForm({
  calendars, defaultDate, organizerEmail, organizerName, onSubmit, loading,
  initialValues, submitLabel = 'Save Event', disableCalendarChange = false,
}: Props) {
  const theme = useTheme();

  const [summary, setSummary] = useState(initialValues?.summary ?? '');
  // Only offer writable calendars for new events; read-only calendars
  // (external subscriptions, manager-controlled shared calendars) cannot
  // receive new VEVENTs via PUT.
  const writableCalendars = calendars.filter((c) => !c.isReadOnly && !c.isSubscribed);

  const defaultCalendarId =
    initialValues?.calendarId ??
    writableCalendars.find((c) => c.slug.toLowerCase() === 'personal')?.id ??
    writableCalendars[0]?.id ?? '';
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [allDay, setAllDay] = useState(initialValues?.allDay ?? false);
  const [dtstart, setDtstart] = useState(initialValues?.dtstart ?? defaultDate ?? new Date());
  const [dtend, setDtend] = useState(
    initialValues?.dtend ?? (defaultDate ? dayjs(defaultDate).add(1, 'hour').toDate() : dayjs().add(1, 'hour').toDate())
  );
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [location, setLocation] = useState(initialValues?.location ?? '');
  const [withTalkRoom, setWithTalkRoom] = useState(false);
  const [talkRoomType, setTalkRoomType] = useState<TalkRoomType>('private');
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees] = useState<Attendee[]>(initialValues?.attendees ?? []);
  const [rrule, setRrule] = useState<RecurrenceRule | undefined>(initialValues?.rrule);
  const [error, setError] = useState<string | null>(null);

  // iOS: simple show/hide booleans
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);

  // Android: two-step date→time picker state
  const [androidStep, setAndroidStep] = useState<AndroidPickerStep>(null);

  const scrollRef = useRef<ScrollView>(null);
  const attendeeFocused = useRef(false);

  function openStartPicker() {
    if (Platform.OS === 'android') {
      setAndroidStep({ target: 'start', step: 'date' });
    } else {
      setShowEndPicker(false);
      setShowStartPicker((v) => !v);
    }
  }

  function openEndPicker() {
    if (Platform.OS === 'android') {
      setAndroidStep({ target: 'end', step: 'date' });
    } else {
      setShowStartPicker(false);
      setShowEndPicker((v) => !v);
    }
  }

  function handleIosStartChange(_: any, d?: Date) {
    // Keep picker open — onChange fires while scrolling; user taps button again to dismiss
    if (d) setDtstart(d);
  }

  function handleIosEndChange(_: any, d?: Date) {
    if (d) setDtend(d);
  }

  function handleAndroidChange(_: any, selected?: Date) {
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
      if (target === 'start') setDtstart(finalDate);
      else setDtend(finalDate);
      setAndroidStep(null);
    } else {
      setAndroidStep({ target, step: 'time', partial: selected });
    }
  }

  function addAttendee() {
    const email = attendeeInput.trim();
    if (!email || !email.includes('@')) return;
    setAttendees((prev) => [...prev, { email }]);
    setAttendeeInput('');
  }

  function removeAttendee(email: string) {
    setAttendees((prev) => prev.filter((a) => a.email !== email));
  }

  function handleSubmit() {
    if (!summary.trim()) { setError('Title is required.'); return; }
    if (!calendarId) { setError('Select a calendar.'); return; }
    if (!allDay && dtend <= dtstart) { setError('End time must be after start time.'); return; }
    setError(null);
    onSubmit({
      summary: summary.trim(), calendarId, dtstart, dtend, allDay,
      description, location, attendees, withTalkRoom, talkRoomType,
      organizerEmail, organizerName, rrule,
    });
  }

  const inputStyle = [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }];
  const labelStyle = [styles.label, { color: theme.textSecondary }];


  const androidPickerMode = androidStep?.step === 'time' ? 'time' : 'date';
  const androidPickerValue = androidStep?.step === 'time' && androidStep.partial
    ? androidStep.partial
    : androidStep?.target === 'start' ? dtstart : dtend;

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.scroll, { backgroundColor: theme.background }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="none"
    >
      <Text style={labelStyle}>Title *</Text>
      <TextInput
        style={inputStyle}
        value={summary}
        onChangeText={setSummary}
        placeholder="Event title"
        placeholderTextColor={theme.textTertiary}
      />

      <Text style={labelStyle}>Calendar</Text>
      {writableCalendars.length === 0 && (
        <Text style={[styles.readOnlyNote, { color: theme.warning }]}>
          No writable calendars available on this account.
        </Text>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {writableCalendars.map((cal) => (
          <TouchableOpacity
            key={cal.id}
            style={[
              styles.calChip,
              { backgroundColor: theme.chip },
              calendarId === cal.id && { backgroundColor: cal.color },
              disableCalendarChange && { opacity: 0.6 },
            ]}
            onPress={() => !disableCalendarChange && setCalendarId(cal.id)}
            disabled={disableCalendarChange}
          >
            <Text style={[
              styles.calChipText,
              { color: theme.textSecondary },
              calendarId === cal.id && { color: '#fff' },
            ]}>
              {cal.displayName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={[styles.row, { borderBottomColor: theme.border }]}>
        <Text style={labelStyle}>All Day</Text>
        <Switch
          value={allDay}
          onValueChange={setAllDay}
          trackColor={{ false: theme.border, true: theme.primary }}
          thumbColor="#fff"
        />
      </View>

      <Text style={labelStyle}>Start</Text>
      <TouchableOpacity style={inputStyle} onPress={openStartPicker}>
        <Text style={{ color: theme.text }}>
          {allDay ? dayjs(dtstart).format('MMM D, YYYY') : dayjs(dtstart).format('MMM D, YYYY h:mm A')}
        </Text>
      </TouchableOpacity>


      {Platform.OS === 'ios' && showStartPicker && (
        <DateTimePicker
          value={dtstart}
          mode={allDay ? 'date' : 'datetime'}
          onChange={handleIosStartChange}
        />
      )}

      {!allDay && (
        <>
          <Text style={labelStyle}>End</Text>
          <TouchableOpacity style={inputStyle} onPress={openEndPicker}>
            <Text style={{ color: theme.text }}>{dayjs(dtend).format('MMM D, YYYY h:mm A')}</Text>
          </TouchableOpacity>
          {Platform.OS === 'ios' && showEndPicker && (
            <DateTimePicker
              value={dtend}
              mode="datetime"
              onChange={handleIosEndChange}
            />
          )}
        </>
      )}


      {Platform.OS === 'android' && androidStep !== null && (
        <DateTimePicker
          key={`android-picker-${androidStep.target}-${androidStep.step}`}
          value={androidPickerValue ?? new Date()}
          mode={androidPickerMode}
          onChange={handleAndroidChange}
        />
      )}

      <RecurrencePicker value={rrule} onChange={setRrule} />

      <Text style={[labelStyle, { marginTop: 16 }]}>Location</Text>
      <TextInput
        style={inputStyle}
        value={location}
        onChangeText={setLocation}
        placeholder="Room or address"
        placeholderTextColor={theme.textTertiary}
      />

      <Text style={labelStyle}>Description</Text>
      <TextInput
        style={[inputStyle, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Details..."
        placeholderTextColor={theme.textTertiary}
        multiline
        numberOfLines={3}
      />

      <Text style={labelStyle}>Attendees</Text>
      <View style={styles.attendeeRow}>
        <TextInput
          style={[inputStyle, styles.attendeeInput]}
          value={attendeeInput}
          onChangeText={setAttendeeInput}
          placeholder="email@example.com"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={addAttendee}
          onFocus={() => {
            if (!attendeeFocused.current) {
              attendeeFocused.current = true;
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onBlur={() => { attendeeFocused.current = false; }}
        />
        <TouchableOpacity style={[styles.addBtn, { backgroundColor: theme.primary }]} onPress={addAttendee}>
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      {attendees.map((att) => (
        <View key={att.email} style={[styles.attendeeChip, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.attendeeEmail, { color: theme.primary }]}>{att.email}</Text>
          <TouchableOpacity onPress={() => removeAttendee(att.email)}>
            <Text style={[styles.removeBtn, { color: theme.textTertiary }]}>×</Text>
          </TouchableOpacity>
        </View>
      ))}

      <TalkToggle
        value={withTalkRoom}
        onChange={setWithTalkRoom}
        roomType={talkRoomType}
        onRoomTypeChange={setTalkRoomType}
      />

      {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: theme.primary }, loading && styles.saveBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.saveBtnText}>{loading ? 'Saving…' : submitLabel}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, padding: 20 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 4, marginTop: 16 },
  input: {
    borderWidth: 1, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 4,
  },
  multiline: { height: 80, textAlignVertical: 'top' },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 16, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  readOnlyNote: { fontSize: 13, marginBottom: 8 },
  calChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  calChipText: { fontSize: 14 },
  attendeeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  attendeeInput: { flex: 1, marginBottom: 0 },
  addBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '600' },
  attendeeChip: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6,
  },
  attendeeEmail: { fontSize: 14 },
  removeBtn: { fontSize: 20, lineHeight: 22 },
  error: { fontSize: 14, marginTop: 12 },
  saveBtn: { borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginTop: 24, marginBottom: 40 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
