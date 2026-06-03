import { useState } from 'react';
import * as Crypto from 'expo-crypto';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { validateCredentials } from '@/api/caldav';
import { saveAccount, setActiveAccountId } from '@/api/auth';
import { fetchUserInfo } from '@/api/nextcloud';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/hooks/useTheme';
import type { Account } from '@/types';

export default function SetupScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const setStoreId = useAppStore((s) => s.setActiveAccountId);

  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function handleAdd() {
    setError(null);
    if (!baseUrl || !username || !appPassword) {
      setError('All fields are required.');
      return;
    }
    let normalizedUrl = baseUrl.trim().replace(/\/$/, '');
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }
    setLoading(true);
    try {
      const { davUserId } = await validateCredentials({ baseUrl: normalizedUrl, username, appPassword });
      const userInfo = await fetchUserInfo({
        baseUrl: normalizedUrl,
        username,
        appPassword,
        davUserId,
      });
      const account: Account = {
        id: Crypto.randomUUID(),
        displayName: displayName || username,
        baseUrl: normalizedUrl,
        username,
        appPassword,
        davUserId,
        timezone: userInfo.timezone,
        email: userInfo.email,
      };
      await saveAccount(account);
      await setActiveAccountId(account.id);
      setStoreId(account.id);
      queryClient.setQueryData<Account[]>(['accounts'], (old = []) =>
        old.find((a) => a.id === account.id) ? old : [...old, account]
      );
      router.replace('/(tabs)/calendar');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes('401') || msg.includes('auth')
          ? 'Invalid credentials. Check your app password.'
          : `Could not connect: ${msg}`
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

          <Text style={[styles.brandName, { color: theme.primary }]}>Nextcloud Calendar</Text>
          <Text style={[styles.title, { color: theme.text }]}>Connect to Nextcloud</Text>

          <Text style={[styles.label, { color: theme.text }]}>Server URL</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            placeholder="https://cloud.example.com"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={baseUrl}
            onChangeText={setBaseUrl}
          />

          <Text style={[styles.label, { color: theme.text }]}>Username</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            placeholder="john.doe"
            placeholderTextColor={theme.textTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />

          <Text style={[styles.label, { color: theme.text }]}>App Password</Text>
          <View style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <TextInput
              style={[styles.inputInner, { color: theme.text }]}
              placeholder="xxxx-xxxx-xxxx-xxxx"
              placeholderTextColor={theme.textTertiary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              value={appPassword}
              onChangeText={setAppPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={theme.textTertiary}
              />
            </TouchableOpacity>
          </View>

          <Text style={[styles.label, { color: theme.text }]}>Display Name <Text style={{ color: theme.textTertiary, fontWeight: '400' }}>(optional)</Text></Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            placeholder="Work"
            placeholderTextColor={theme.textTertiary}
            value={displayName}
            onChangeText={setDisplayName}
          />

          {error && <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>}

          <TouchableOpacity
            style={[styles.button, { backgroundColor: theme.primary }]}
            onPress={handleAdd}
            disabled={loading}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Connect</Text>}
          </TouchableOpacity>

          <Text style={[styles.hint, { color: theme.textTertiary }]}>
            Generate an app password in Nextcloud → Settings → Security → App passwords.
          </Text>

        </ScrollView>

        <Text style={[styles.footer, { color: theme.textTertiary }]}>
          Made with ♥ for the community · Open Source
        </Text>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { padding: 24, paddingTop: 52 },
  brandName: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 18 },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 16,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderRadius: 10,
  },
  inputInner: { flex: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16 },
  eyeBtn: { paddingHorizontal: 14, paddingVertical: 13 },
  error: { marginTop: 14, fontSize: 14 },
  button: {
    borderRadius: 10, paddingVertical: 15,
    alignItems: 'center', marginTop: 28,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 20, lineHeight: 19 },
  footer: { fontSize: 12, textAlign: 'center', paddingBottom: 16, paddingTop: 8 },
});
