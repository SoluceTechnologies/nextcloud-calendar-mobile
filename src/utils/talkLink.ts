import type ICAL from 'ical.js';

export const TALK_URL_PATTERN = /\/call\//;

const TALK_URL_IN_TEXT = /https?:\/\/[^\s"'<>]+\/call\/[A-Za-z0-9_-]+/;

function conferenceUrl(vevent: ICAL.Component | undefined): string | undefined {
  if (!vevent) return undefined;
  for (const prop of vevent.getAllProperties('conference')) {
    const value = prop.getFirstValue();
    if (typeof value === 'string' && TALK_URL_PATTERN.test(value)) return value;
  }
  return undefined;
}

function descriptionTalkUrl(description: string | undefined): string | undefined {
  if (!description) return undefined;
  const match = description.match(TALK_URL_IN_TEXT);
  return match?.[0];
}

// Web convention (nextcloud/calendar #5395): Talk URL goes to LOCATION when
// empty, else appended to DESCRIPTION (hybrid events). Newer web also emits
// CONFERENCE;VALUE=URI. Detection order: CONFERENCE → LOCATION → DESCRIPTION.
export function extractTalkUrl(
  location?: string,
  description?: string,
  vevent?: ICAL.Component,
): string | undefined {
  return (
    conferenceUrl(vevent) ??
    (location && TALK_URL_PATTERN.test(location) ? location : undefined) ??
    descriptionTalkUrl(description)
  );
}
