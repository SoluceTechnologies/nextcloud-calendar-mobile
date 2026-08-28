import { useState } from 'react';
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
    <Stack gap={8}>
      <Typography variant="body2" color="secondary">{t('event.attendees')}</Typography>
      <View onLayout={onInputLayout}>
        <Stack direction="horizontal" vAlign="center" gap={8}>
          <View style={styles.grow}>
            <TextField
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
          <Button variant="primary" title={t('event.add')} onPress={() => addAttendee()} />
        </Stack>
      </View>

      {contactsLoading && (
        <View style={styles.suggestionLoading}>
          <Spinner size="small" color="secondary" />
        </View>
      )}

      {!contactsLoading && suggestions.length > 0 && (
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
  suggestionScroll: { maxHeight: 220 },
  suggestionScrollContent: { flexGrow: 1 },
  suggestionLoading: { paddingVertical: 8, alignItems: 'center' },
});
