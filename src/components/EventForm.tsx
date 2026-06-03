import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Switch,
  StyleSheet, ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import dayjs from 'dayjs';
import { useTheme } from '@/hooks/useTheme';
import { TalkToggle } from './TalkToggle';
import type { CalendarMeta, Attendee, CreateEventInput } from '@/types';

interface InitialValues {
  summary?: string;
  calendarId?: string;
  allDay?: boolean;
  dtstart?: Date;
  dtend?: Date;
  description?: string;
  location?: string;
  attendees?: Attendee[];
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

export function EventForm({
  calendars, defaultDate, organizerEmail, organizerName, onSubmit, loading,
  initialValues, submitLabel = 'Save Event', disableCalendarChange = false,
}: Props) {
  const theme = useTheme();

  const [summary, setSummary] = useState(initialValues?.summary ?? '');
  const defaultCalendarId =
    initialValues?.calendarId ??
    calendars.find((c) => c.slug.toLowerCase() === 'personal')?.id ??
    calendars[0]?.id ?? '';
  const [calendarId, setCalendarId] = useState(defaultCalendarId);
  const [allDay, setAllDay] = useState(initialValues?.allDay ?? false);
  const [dtstart, setDtstart] = useState(initialValues?.dtstart ?? defaultDate ?? new Date());
  const [dtend, setDtend] = useState(
    initialValues?.dtend ?? (defaultDate ? dayjs(defaultDate).add(1, 'hour').toDate() : dayjs().add(1, 'hour').toDate())
  );
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [location, setLocation] = useState(initialValues?.location ?? '');
  const [withTalkRoom, setWithTalkRoom] = useState(false);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [attendees, setAttendees] = useState<Attendee[]>(initialValues?.attendees ?? []);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      description, location, attendees, withTalkRoom, organizerEmail, organizerName,
    });
  }

  const scrollRef = useRef<ScrollView>(null);

  const inputStyle = [styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }];
  const labelStyle = [styles.label, { color: theme.textSecondary }];

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.scroll, { backgroundColor: theme.background }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      automaticallyAdjustKeyboardInsets
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {calendars.map((cal) => (
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
      <TouchableOpacity style={inputStyle} onPress={() => setShowStartPicker(true)}>
        <Text style={{ color: theme.text }}>
          {allDay ? dayjs(dtstart).format('MMM D, YYYY') : dayjs(dtstart).format('MMM D, YYYY h:mm A')}
        </Text>
      </TouchableOpacity>
      {showStartPicker && (
        <DateTimePicker
          value={dtstart}
          mode={allDay ? 'date' : 'datetime'}
          onChange={(_, d) => { setShowStartPicker(false); if (d) setDtstart(d); }}
        />
      )}

      {!allDay && (
        <>
          <Text style={labelStyle}>End</Text>
          <TouchableOpacity style={inputStyle} onPress={() => setShowEndPicker(true)}>
            <Text style={{ color: theme.text }}>{dayjs(dtend).format('MMM D, YYYY h:mm A')}</Text>
          </TouchableOpacity>
          {showEndPicker && (
            <DateTimePicker
              value={dtend}
              mode="datetime"
              onChange={(_, d) => { setShowEndPicker(false); if (d) setDtend(d); }}
            />
          )}
        </>
      )}

      <Text style={labelStyle}>Location</Text>
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
      <View
        style={styles.attendeeRow}
        onLayout={(e) => {
          const y = e.nativeEvent.layout.y;
          scrollRef.current?.scrollTo({ y: y - 20, animated: true });
        }}
      >
        <TextInput
          style={[inputStyle, styles.attendeeInput]}
          value={attendeeInput}
          onChangeText={setAttendeeInput}
          placeholder="email@example.com"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="none"
          keyboardType="email-address"
          onSubmitEditing={addAttendee}
          onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
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

      <TalkToggle value={withTalkRoom} onChange={setWithTalkRoom} />

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
