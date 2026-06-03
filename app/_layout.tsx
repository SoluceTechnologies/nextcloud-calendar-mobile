import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { loadAccounts, getActiveAccountId, setActiveAccountId } from '@/api/auth';
import { useAppStore } from '@/store/appStore';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 7 * 24 * 60 * 60 * 1000,
      networkMode: 'offlineFirst',
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'rq-cache',
  throttleTime: 3000,
});

function ThemedStatusBar() {
  const systemScheme = useColorScheme();
  const themePreference = useAppStore((s) => s.themePreference);
  const resolved =
    themePreference === 'system' ? (systemScheme ?? 'light') : themePreference;
  return <StatusBar style={resolved === 'dark' ? 'light' : 'dark'} />;
}

export default function RootLayout() {
  const router = useRouter();
  const setStoreAccountId = useAppStore((s) => s.setActiveAccountId);

  useEffect(() => {
    (async () => {
      try {
        const accounts = await loadAccounts();
        queryClient.setQueryData(['accounts'], accounts);
        if (accounts.length === 0) {
          router.replace('/(auth)/setup');
        } else {
          const activeId = await getActiveAccountId();
          const id = activeId ?? accounts[0].id;
          await setActiveAccountId(id);
          setStoreAccountId(id);
        }
      } finally {
        await SplashScreen.hideAsync();
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: asyncStoragePersister }}
      >
        <ThemedStatusBar />
        <Stack screenOptions={{ headerShown: false }} />
      </PersistQueryClientProvider>
    </GestureHandlerRootView>
  );
}
