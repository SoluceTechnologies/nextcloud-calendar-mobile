import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';

export function usePickIcsFile() {
  const router = useRouter();
  return useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/calendar', 'application/ics', 'application/octet-stream'],
      copyToCacheDirectory: true,
    });
    const uri = result.canceled ? undefined : result.assets[0]?.uri;
    if (uri) router.push({ pathname: '/event/import', params: { uri } });
  }, [router]);
}
