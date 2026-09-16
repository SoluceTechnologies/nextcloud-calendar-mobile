import { Redirect, useLocalSearchParams } from 'expo-router';
import { IcsImportScreen } from '@/features/event/components/IcsImportScreen';

export default function IcsImportRoute() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  if (!uri) return <Redirect href="/" />;

  return <IcsImportScreen uri={uri} />;
}
