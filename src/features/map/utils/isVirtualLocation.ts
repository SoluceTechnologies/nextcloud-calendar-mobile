import { meetingProvider } from '@/features/widget/core/liveEvent';

export function isVirtualLocation(location: string | undefined, talkUrl?: string): boolean {
  if (!location) return false;
  if (talkUrl) return true;
  return meetingProvider(location) !== null;
}
