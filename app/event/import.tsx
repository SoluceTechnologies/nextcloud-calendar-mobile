import { useLocalSearchParams } from 'expo-router';
import { IcsImportScreen } from '@/features/event/components/IcsImportScreen';

export default function IcsImportRoute() {
  const { uri } = useLocalSearchParams<{ uri?: string }>();

  if (!uri) return null;

  return <IcsImportScreen uri={uri} />;
}
