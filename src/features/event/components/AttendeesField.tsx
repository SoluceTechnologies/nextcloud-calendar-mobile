import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, LayoutChangeEvent } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from 'expo-router';
import { X } from 'lucide-react-native';
import { ContactAvatar } from './ContactAvatar';
import { useContactSuggestions } from '@/features/event/hooks/useContactSuggestions';
import { dedupeAttendees } from '@/utils/attendees';
import { Stack, Typography, TextField, Button, IconButton, List, Item, Spinner } from '@/ui/components';
import type { Account, Attendee } from '@/types';

interface Props {
  attendees: Attendee[];
  onChange: (attendees: Attendee[]) => void;
  account?: Pick<Account, 'id' | 'baseUrl' | 'username' | 'appPassword'> | null;
  onInputLayout?: (event: LayoutChangeEvent) => void;
  onInputFocus?: () => void;
}

export function AttendeesField({ attendees, onChange, account, onInputLayout, onInputFocus }: Props) {
  const theme = useTheme();
  const { t } = useTranslation();

  const [attendeeInput, setAttendeeInput] = useState('');
  const { suggestions, loading: contactsLoading } = useContactSuggestions({
    account: account ?? null,
    query: attendeeInput,
  });

  // The field sits at the bottom of a long form and Android's focus scroll
  // pins it just above the keyboard, so a list rendered *below* the input
  // ends up hidden. The list is rendered as an overlay *above* the input
  // instead; once suggestions land we nudge the form scroll (after the
  // keyboard resize settles) so the input rests right above the viewport.
  const hadSuggestions = useRef(false);
  useEffect(() => {
    if (suggestions.length === 0) {
      hadSuggestions.current = false;
      return;
    }
    if (hadSuggestions.current) return;
    hadSuggestions.current = true;
    const t = setTimeout(() => onInputFocus?.(), 300);
    return () => clearTimeout(t);
  }, [suggestions.length, onInputFocus]);

  function addAttendee(contact?: Attendee) {
    if (contact?.email) {
      onChange(dedupeAttendees([...attendees, contact]));
      setAttendeeInput('');
      return;
    }

    const email = attendeeInput.trim();
    if (!email || !email.includes('@')) return;
    onChange(dedupeAttendees([...attendees, { email }]));
    setAttendeeInput('');
  }

  function removeAttendee(email: string) {
    onChange(attendees.filter((a) => a.email !== email));
  }

  return (
    <Stack gap={8} onLayout={onInputLayout}>
      <Typography variant="body2" color="secondary">{t('event.attendees')}</Typography>
      <View style={styles.inputArea}>
        <Stack direction="horizontal" vAlign="center" gap={8}>
          <View style={styles.grow}>
            <TextField
              testID="event-form-attendee-input"
              value={attendeeInput}
              onChangeText={setAttendeeInput}
              placeholder={t('event.attendeePlaceholder')}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="email"
              textContentType="emailAddress"
              onSubmitEditing={() => addAttendee()}
              onFocus={onInputFocus}
            />
          </View>
          <Button testID="event-form-attendee-add" variant="primary" title={t('event.add')} onPress={() => addAttendee()} />
        </Stack>

        {!contactsLoading && suggestions.length > 0 && (
          <View
            style={[
              styles.suggestionPanel,
              { backgroundColor: theme.colors.surfaceRaised, borderColor: theme.colors.border },
            ]}
          >
            <ScrollView
              style={styles.suggestionScroll}
              contentContainerStyle={styles.suggestionScrollContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="none"
            >
              <List radius={12}>
                {suggestions.map((contact) => (
                  <Item
                    key={contact.id}
                    title={contact.displayName}
                    description={contact.email}
                    leading={<ContactAvatar account={account ?? null} contact={contact} size={32} />}
                    onPress={() => addAttendee({ email: contact.email, displayName: contact.displayName })}
                  />
                ))}
              </List>
            </ScrollView>
          </View>
        )}
      </View>

      {contactsLoading && (
        <View style={styles.suggestionLoading}>
          <Spinner size="small" color="secondary" />
        </View>
      )}

      {attendees.map((att) => (
        <Stack
          key={att.email}
          direction="horizontal" vAlign="center" bordered
          gap={8} padding={[12, 8]}
        >
          <View>
            <Typography variant="body2" color="primary">{att.displayName ?? att.email}</Typography>
            {att.displayName ? (
              <Typography variant="caption" color="secondary">{att.email}</Typography>
            ) : null}
          </View>
          <View style={styles.pushRight}>
            <IconButton variant="plain" size={32} onPress={() => removeAttendee(att.email)}>
              <X size={18} color={theme.colors.textTertiary} />
            </IconButton>
          </View>
        </Stack>
      ))}
    </Stack>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  pushRight: { marginLeft: 'auto' },
  // Anchors the suggestion panel to the input row without affecting layout.
  inputArea: { position: 'relative', zIndex: 10, elevation: 10 },
  suggestionPanel: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: 6,
    maxHeight: 220,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  suggestionScroll: { maxHeight: 220 },
  suggestionScrollContent: { flexGrow: 1 },
  suggestionLoading: { paddingVertical: 8, alignItems: 'center' },
});
