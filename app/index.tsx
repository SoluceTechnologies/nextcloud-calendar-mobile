import { Redirect } from 'expo-router';
import { useAccounts } from '@/hooks/useAccounts';

export default function Index() {
  const accounts = useAccounts();
  return <Redirect href={accounts.length > 0 ? '/(tabs)/calendar' : '/(auth)/setup'} />;
}
