import { create } from 'zustand';
import type { Account, Attendee, SuggestedSlot } from '@/types';
import type { FindTimeMode } from '@/features/event/hooks/useFreeBusy';

/**
 * Carries the event-editing context from the EventForm / suggestions sheet to
 * the full-screen find-time route, and the chosen slot back to the form.
 * Route params cannot hold objects, so the request/result live in memory here.
 */
export interface FindTimeRequest {
  account: Pick<Account, 'id' | 'displayName' | 'baseUrl' | 'username' | 'appPassword' | 'davUserId'>;
  organizer: Attendee;
  attendees: Attendee[];
  start: Date;
  end: Date;
  eventTitle: string;
  mode: FindTimeMode;
  requiredAttendees: string[];
}

interface FindTimeState {
  request: FindTimeRequest | null;
  result: SuggestedSlot | null;
  setRequest: (request: FindTimeRequest) => void;
  setResult: (result: SuggestedSlot) => void;
  clearResult: () => void;
  reset: () => void;
}

export const useFindTimeStore = create<FindTimeState>()((set) => ({
  request: null,
  result: null,
  setRequest: (request) => set({ request, result: null }),
  setResult: (result) => set({ result }),
  clearResult: () => set({ result: null }),
  reset: () => set({ request: null, result: null }),
}));
