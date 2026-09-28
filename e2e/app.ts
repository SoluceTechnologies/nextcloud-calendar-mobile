/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { allDay } from './ics';
import { ADMIN, E2E_CAL, NextcloudContainer, SEED_TITLE, type StartedNextcloud } from './nextcloud';

const APK = process.env.APK ?? 'android/app/build/outputs/apk/release/app-release.apk';
const APP_ID = 'com.soluce.nextcloudcalendar';
const MAESTRO_DIR = join(__dirname, 'maestro');
const REPORT_DIR = process.env.MAESTRO_REPORT_DIR;

export interface Suite {
  readonly nc: StartedNextcloud;
}

export function setupSuite(): Suite {
  const suite = {} as { nc: StartedNextcloud };
  beforeAll(async () => {
    installApp();
    adb(['shell', 'pm', 'clear', APP_ID]);
    suite.nc = await new NextcloudContainer().start();
    await suite.nc.setEmail(ADMIN.user, 'e2e@example.test');
    await suite.nc.dav.createCalendar(E2E_CAL, 'E2E');
    await suite.nc.dav.putEvent(E2E_CAL, 'e2e-seed', allDay({ uid: 'e2e-seed', summary: SEED_TITLE, day: today() }));
  });
  afterEach(() => {
    adb(['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable']);
  });
  afterAll(async () => {
    await suite.nc?.stop();
  });
  return suite;
}

export function runFlow(nc: StartedNextcloud, flow: string, vars: Record<string, string> = {}): void {
  const env = { NC_URL: nc.emulatorUrl, NC_USER: ADMIN.user, NC_PASS: ADMIN.password, ...vars };
  const device = process.env.ANDROID_SERIAL;
  const args = [...(device ? ['--device', device] : []), 'test', join(MAESTRO_DIR, `${flow}.yaml`)];
  for (const [key, value] of Object.entries(env)) args.push('-e', `${key}=${value}`);
  if (REPORT_DIR) args.push('--format', 'junit', '--output', join(REPORT_DIR, `${flow.replace(/\//g, '-')}.xml`));
  execFileSync('maestro', args, { stdio: 'inherit' });
}

export function uniqueTitle(prefix: string): string {
  return `E2E ${prefix}${String(Date.now()).slice(-6)}`;
}

export function uidOf(title: string): string {
  return title.toLowerCase().replace(/\s+/g, '-');
}

export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function eventually<T>(
  probe: () => Promise<T>,
  accept: (v: T) => boolean,
  timeoutMs = 120_000,
): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (accept(value) || Date.now() > until) return value;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

export function emulatorTimezone(): string {
  return adb(['shell', 'getprop', 'persist.sys.timezone']).trim() || 'UTC';
}

export function zonedToUtc(day: Date, hh: number, mm: number, tz: string): Date {
  const guess = Date.UTC(day.getFullYear(), day.getMonth(), day.getDate(), hh, mm);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(guess));
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const seenAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess - (seenAsUtc - guess));
}

function installApp(): void {
  if (!existsSync(APK)) throw new Error(`APK not found at ${APK}. Run \`just e2e-build\` first.`);
  try {
    execFileSync('adb', ['get-state'], { stdio: 'pipe' });
  } catch {
    throw new Error('No Android device/emulator connected. Start one (e.g. `emulator -avd <name>`) and retry.');
  }
  execFileSync('adb', ['install', '-r', APK], { stdio: 'inherit' });
}

function adb(args: string[]): string {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}
