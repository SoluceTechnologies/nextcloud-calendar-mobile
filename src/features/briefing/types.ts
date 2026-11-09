export interface BriefingSegment {
  key: string; // stable per segment ('intro' | 'allday' | 'outro' | event uid)
  text: string; // exactly what gets spoken
  eventUid?: string;
}
