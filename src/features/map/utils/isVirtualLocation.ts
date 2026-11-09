import { meetingProvider } from '@/features/widget/core/liveEvent';

// A "virtual" location is the meeting link itself (LOCATION holds a /call/ or
// Meet/Zoom URL). A hybrid event — real LOCATION + Talk link in DESCRIPTION or
// CONFERENCE — keeps its physical location and map.
export function isVirtualLocation(location: string | undefined): boolean {
  if (!location) return false;
  return meetingProvider(location) !== null;
}
