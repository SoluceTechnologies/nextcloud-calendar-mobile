/// <reference types="node" />
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { ADMIN, Nextcloud, SEED_UID, type NextcloudLocation } from './nextcloud';

const APK = process.env.APK ?? 'android/app/build/outputs/apk/release/app-release.apk';
const APP_ID = 'com.soluce.nextcloudcalendar';
const MAESTRO_DIR = join(__dirname, 'maestro');
const REPORT_DIR = process.env.MAESTRO_REPORT_DIR;
// Maestro doesn't create the --output folder.
if (REPORT_DIR) mkdirSync(REPORT_DIR, { recursive: true });
const run = promisify(execFile);

export interface Suite {
  readonly nc: Nextcloud;
}

/**
 * Attaches the suite to the server started once by globalSetup, already logged in: the session is
 * shared by every suite. The server is wiped back to the seed event before each test, so a test
 * never sees events left by another (today's all-day lane only shows a few rows).
 */
export function setupSuite(): Suite {
  const suite = {} as { nc: Nextcloud };
  beforeAll(() => {
    suite.nc = new Nextcloud(JSON.parse(process.env.E2E_NEXTCLOUD!) as NextcloudLocation);
  });
  beforeEach(async () => {
    // A test killed by its timeout while the server was paused never ran its `finally`.
    await suite.nc.unpause().catch(() => {});
    await suite.nc.dav.clearEvents([`${SEED_UID}.ics`]);
  });
  afterEach(() => {
    adb(['shell', 'cmd', 'connectivity', 'airplane-mode', 'disable']);
  });
  return suite;
}

const ANIMATION_SCALES = ['window_animation_scale', 'transition_animation_scale', 'animator_duration_scale'];

/**
 * Turns system animations off for the run: Maestro waits for the screen to settle after every tap,
 * so animations cost seconds per step. Returns a function putting the previous values back.
 */
export function disableAnimations(): () => void {
  const before = ANIMATION_SCALES.map((key) => adb(['shell', 'settings', 'get', 'global', key]).trim());
  for (const key of ANIMATION_SCALES) adb(['shell', 'settings', 'put', 'global', key, '0']);
  return () => ANIMATION_SCALES.forEach((key, i) => {
    if (!before[i]) return;
    adb(['shell', 'settings', ...(before[i] === 'null' ? ['delete', 'global', key] : ['put', 'global', key, before[i]])]);
  });
}

// Maestro's on-device driver sometimes dies: a start-up timeout, then every call UNAVAILABLE.
const DRIVER_DEAD = /did not start up in time|DeviceServerDiedException|StatusRuntimeException: UNAVAILABLE/;
const MAESTRO_DRIVER_PACKAGES = ['dev.mobile.maestro', 'dev.mobile.maestro.test'];

export function runFlow(nc: Nextcloud, flow: string, vars: Record<string, string> = {}): void {
  const env = { NC_URL: nc.emulatorUrl, NC_USER: ADMIN.user, NC_PASS: ADMIN.password, ...vars };
  const flowArgs = [join(MAESTRO_DIR, `${flow}.yaml`)];
  for (const [key, value] of Object.entries(env)) flowArgs.push('-e', `${key}=${value}`);
  if (REPORT_DIR) flowArgs.push('--format', 'junit', '--output', join(REPORT_DIR, `${flow.replace(/\//g, '-')}.xml`));

  // Maestro reinstalls its driver on every run by default, which costs seconds per flow. The login
  // in globalSetup installs it; test files inherit the flag through their copy of process.env.
  const ready = process.env.E2E_MAESTRO_DRIVER_READY;
  let result = maestro(ready ? ['--no-reinstall-driver', ...flowArgs] : flowArgs);
  if (result.status !== 0 && driverDied(result.output)) {
    // Not the app failing: the driver died. Kill it, drop its stale port forward, reinstall it and
    // run the flow once more.
    for (const pkg of MAESTRO_DRIVER_PACKAGES) adb(['shell', 'am', 'force-stop', pkg]);
    adb(['forward', '--remove-all']);
    result = maestro(flowArgs);
  }
  if (result.status !== 0) {
    delete process.env.E2E_MAESTRO_DRIVER_READY;
    throw new Error(`Maestro flow ${flow} failed (exit ${result.status}), see its output above`);
  }
  process.env.E2E_MAESTRO_DRIVER_READY = '1';
}

/** The console only says the flow failed; the cause is in the debug log whose path it prints. */
function driverDied(output: string): boolean {
  const dir = output.match(/Debug output \(logs & screenshots\) ====\s+(\S+)/)?.[1];
  const log = dir && join(dir, 'maestro.log');
  return DRIVER_DEAD.test(log && existsSync(log) ? readFileSync(log, 'utf8') : output);
}

/** Runs `maestro test`, printing its output once it ends (it is needed to spot a dead driver). */
function maestro(args: string[]): { status: number | null; output: string } {
  const device = process.env.ANDROID_SERIAL;
  const r = spawnSync('maestro', [...(device ? ['--device', device] : []), 'test', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // spawnSync blocks the event loop, so Jest's test timeout can't stop a hung flow: kill it first.
    timeout: 9 * 60 * 1000,
    killSignal: 'SIGKILL',
  });
  const output = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  process.stdout.write(output);
  return { status: r.status, output };
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

/** Polls `probe` until `accept` holds or the timeout passes, and returns the last value. */
export async function eventually<T>(
  probe: () => Promise<T>,
  accept: (v: T) => boolean,
  timeoutMs = 30_000,
): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (accept(value) || Date.now() > until) return value;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
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

export async function installApp(): Promise<void> {
  if (!existsSync(APK)) throw new Error(`APK not found at ${APK}. Run \`just e2e-build\` first.`);
  try {
    execFileSync('adb', ['get-state'], { stdio: 'pipe' });
  } catch {
    throw new Error('No Android device/emulator connected. Start one (e.g. `emulator -avd <name>`) and retry.');
  }
  try {
    await run('adb', ['install', '-r', APK]);
  } catch {
    // Installed build signed with another key (e.g. a dev build): -r can't replace it.
    adb(['uninstall', APP_ID]);
    await run('adb', ['install', APK]);
  }
}

function adb(args: string[]): string {
  try {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return '';
  }
}
