// VTODO completion helpers. A task counts as completed when any of the
// Nextcloud criteria holds: STATUS:COMPLETED, a COMPLETED timestamp, or
// PERCENT-COMPLETE:100. STATUS:CANCELLED is rendered as done as well.

export function taskIsCompleted(
  status?: string | null,
  completedAt?: Date | number | null,
  percent?: number | null,
): boolean {
  const s = status?.toUpperCase();
  return s === 'COMPLETED' || s === 'CANCELLED' || completedAt != null || percent === 100;
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

const VTODO_BLOCK = /BEGIN:VTODO[\s\S]*?END:VTODO/gi;

function rewriteBlock(block: string, completed: boolean, now: Date): string {
  const lines = block.split(/\r\n|\r|\n/);
  const out: string[] = [];
  let sawSequence = false;
  let sawDtstamp = false;
  let sawLastModified = false;
  let sawStatus = false;
  let sawPercent = false;
  let sawCompleted = false;

  for (const line of lines) {
    if (/^STATUS[;:]/i.test(line)) {
      out.push(`STATUS:${completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);
      sawStatus = true;
    } else if (/^PERCENT-COMPLETE[;:]/i.test(line)) {
      out.push(`PERCENT-COMPLETE:${completed ? 100 : 0}`);
      sawPercent = true;
    } else if (/^COMPLETED[;:]/i.test(line)) {
      sawCompleted = true;
      if (completed) out.push(`COMPLETED:${stamp(now)}`);
      // uncompleting drops the line entirely
    } else if (/^SEQUENCE[;:]/i.test(line)) {
      const n = Number(line.split(':').pop());
      out.push(`SEQUENCE:${Number.isFinite(n) ? n + 1 : 1}`);
      sawSequence = true;
    } else if (/^DTSTAMP[;:]/i.test(line)) {
      out.push(`DTSTAMP:${stamp(now)}`);
      sawDtstamp = true;
    } else if (/^LAST-MODIFIED[;:]/i.test(line)) {
      out.push(`LAST-MODIFIED:${stamp(now)}`);
      sawLastModified = true;
    } else {
      out.push(line);
    }
  }

  // Insert the properties that were missing, right before END:VTODO.
  const missing: string[] = [];
  if (!sawStatus) missing.push(`STATUS:${completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);
  if (!sawPercent) missing.push(`PERCENT-COMPLETE:${completed ? 100 : 0}`);
  if (completed && !sawCompleted) missing.push(`COMPLETED:${stamp(now)}`);
  if (!sawSequence) missing.push('SEQUENCE:1');
  if (!sawDtstamp) missing.push(`DTSTAMP:${stamp(now)}`);
  if (!sawLastModified) missing.push(`LAST-MODIFIED:${stamp(now)}`);

  const endIdx = out.findIndex((l) => /^END:VTODO/i.test(l));
  if (endIdx === -1) return block;
  out.splice(endIdx, 0, ...missing);
  return out.join('\r\n');
}

// Toggle the completion state of every VTODO in the resource, preserving all
// other properties (X-*, VALARM, RELATED-TO, ...) and bumping the change
// tracking stamps the way Nextcloud Tasks does.
export function setVtodoCompleted(ics: string, completed: boolean, now = new Date()): string {
  if (!/BEGIN:VTODO/i.test(ics)) return ics;
  return ics.replace(VTODO_BLOCK, (block) => rewriteBlock(block, completed, now));
}
