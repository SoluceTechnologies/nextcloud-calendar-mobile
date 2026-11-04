import { Redirect } from 'expo-router';

// nextcloud-calendar://listen — home-widget "Écouter" lands here and bounces to
// the calendar, which starts the day briefing on mount.
export default function ListenDeepLink() {
  return <Redirect href={{ pathname: '/(tabs)/calendar', params: { autolisten: '1' } }} />;
}
