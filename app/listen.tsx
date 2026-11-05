import { Redirect, useLocalSearchParams } from 'expo-router';

// nextcloud-calendar://listen — home-widget "Écouter" lands here and bounces to
// the calendar, which starts the day briefing on mount. Siri intents use
// ?mode=voice (open the assistant sheet listening) and &say=… (pre-formed
// utterance routed straight into the intent pipeline).
export default function ListenDeepLink() {
  const { mode, say } = useLocalSearchParams<{ mode?: string; say?: string }>();
  if (mode === 'voice') {
    return (
      <Redirect href={{ pathname: '/(tabs)/calendar', params: { voice: '1', say: say ?? '' } }} />
    );
  }
  return <Redirect href={{ pathname: '/(tabs)/calendar', params: { autolisten: '1' } }} />;
}
