/// <reference types="node" />
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GenericContainer, Wait, type StartedTestContainer } from 'testcontainers';
import { prop, veventsOf } from './ics';

const run = promisify(execFile);

export interface Creds {
  user: string;
  password: string;
}

export const ADMIN: Creds = { user: 'e2e', password: 'Ncm-E2e-Passw0rd-2026' };
export const E2E_CAL = 'e2e-cal';
export const SEED_UID = 'e2e-seed';
export const SEED_TITLE = 'E2E seed';

const HTTP_PORT = 80;

export class NextcloudContainer extends GenericContainer {
  constructor(image = 'nextcloud:34-apache') {
    super(image);
    this.withEnvironment({
      SQLITE_DATABASE: 'nextcloud',
      NEXTCLOUD_ADMIN_USER: ADMIN.user,
      NEXTCLOUD_ADMIN_PASSWORD: ADMIN.password,
      NEXTCLOUD_TRUSTED_DOMAINS: 'localhost 10.0.2.2',
    })
      .withExposedPorts(HTTP_PORT)
      .withWaitStrategy(
        Wait.forHttp('/status.php', HTTP_PORT).forResponsePredicate((body) => body.includes('"installed":true')),
      )
      .withStartupTimeout(4 * 60 * 1000);
  }
}

/** Where the shared container runs; globalSetup hands it to the test workers through `E2E_NEXTCLOUD`. */
export interface NextcloudLocation {
  id: string;
  host: string;
  port: number;
}

export function locationOf(started: StartedTestContainer): NextcloudLocation {
  return { id: started.getId(), host: started.getHost(), port: started.getMappedPort(HTTP_PORT) };
}

/**
 * Handle on the shared server. It only needs the container id and port, so every Jest worker can
 * rebuild it; occ and pause go through the docker CLI.
 */
export class Nextcloud {
  readonly url: string;
  readonly emulatorUrl: string;
  readonly dav: CalDav;

  constructor(private readonly where: NextcloudLocation) {
    this.url = `http://${where.host}:${where.port}`;
    this.emulatorUrl = `http://10.0.2.2:${where.port}`;
    this.dav = this.as(ADMIN);
  }

  as(creds: Creds): CalDav {
    return new CalDav(this.url, creds);
  }

  async createUser(creds: Creds): Promise<CalDav> {
    await this.occ(['user:add', '--password-from-env', creds.user], { OC_PASS: creds.password });
    return this.as(creds);
  }

  async setPassword(creds: Creds): Promise<void> {
    await this.occ(['user:resetpassword', '--password-from-env', creds.user], { OC_PASS: creds.password });
  }

  async disableBruteforceProtection(): Promise<void> {
    await this.occ(['config:system:set', 'auth.bruteforce.protection.enabled', '--type=boolean', '--value=false']);
  }

  async revokeSessions(user: string): Promise<void> {
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await this.occ(['user:auth-tokens:delete', user, `--last-used-before=${tomorrow}`]);
  }

  async installApp(app: string): Promise<void> {
    await this.occ(['app:install', app]);
  }

  async setEmail(user: string, email: string): Promise<void> {
    await this.occ(['user:setting', user, 'settings', 'email', email]);
  }

  async pause(): Promise<void> {
    await run('docker', ['pause', this.where.id]);
  }

  async unpause(): Promise<void> {
    await run('docker', ['unpause', this.where.id]);
  }

  private async occ(args: string[], env: Record<string, string> = {}): Promise<void> {
    const envArgs = Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
    try {
      await run('docker', ['exec', '-u', 'www-data', '-w', '/var/www/html', ...envArgs, this.where.id, 'php', 'occ', ...args]);
    } catch (e) {
      const { code, stdout, stderr } = e as { code?: number; stdout?: string; stderr?: string };
      throw new Error(`occ ${args.join(' ')} → ${code}\n${stdout ?? ''}${stderr ?? ''}`);
    }
  }
}

export class CalDav {
  constructor(private readonly base: string, readonly creds: Creds) {}

  async createCalendar(slug: string, name: string): Promise<void> {
    await this.request('MKCALENDAR', `${this.home()}/${slug}/`, 'application/xml; charset=utf-8',
      `<?xml version="1.0" encoding="utf-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:set><d:prop><d:displayname>${name}</d:displayname></d:prop></d:set>
</c:mkcalendar>`);
  }

  async putEvent(cal: string, uid: string, ics: string): Promise<void> {
    await this.request('PUT', `${this.home()}/${cal}/${uid}.ics`, 'text/calendar; charset=utf-8', ics);
  }

  async deleteEvent(cal: string, uid: string): Promise<void> {
    await this.request('DELETE', `${this.home()}/${cal}/${uid}.ics`);
  }

  async findEvent(summary: string): Promise<string | null> {
    for (const cal of await this.calendars()) {
      const res = await send(`${this.home()}/${cal}/?export`, { headers: this.auth() });
      if (!res.ok) throw new Error(`GET ${cal}?export → ${res.status}`);
      const hits = veventsOf(await res.text()).filter((v) => prop(v, 'SUMMARY') === summary);
      if (hits.length) return hits.join('\r\n');
    }
    return null;
  }

  /** Deletes every event in every calendar except the resources named in `keep` (e.g. `e2e-seed.ics`). */
  async clearEvents(keep: string[]): Promise<void> {
    for (const cal of await this.calendars()) {
      if (cal === 'contact_birthdays') continue; // generated by the server, read-only
      for (const { href } of await this.propfind(`${this.home()}/${cal}/`)) {
        if (!href.endsWith('.ics') || keep.some((k) => href.endsWith(`/${k}`))) continue;
        await this.request('DELETE', new URL(href, this.base).toString());
      }
    }
  }

  private async calendars(): Promise<string[]> {
    return (await this.propfind(`${this.home()}/`))
      .filter((r) => /:calendar\s*\/>/.test(r.body))
      .map((r) => r.href.replace(/\/$/, '').split('/').pop() ?? '')
      .filter(Boolean);
  }

  private async propfind(url: string): Promise<{ href: string; body: string }[]> {
    const res = await send(url, {
      method: 'PROPFIND',
      headers: { ...this.auth(), Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
    });
    if (res.status !== 207) throw new Error(`PROPFIND ${url} → ${res.status}`);
    return (await res.text())
      .split(/<d:response>/)
      .slice(1)
      .map((body) => ({ href: body.match(/<d:href>([^<]+)<\/d:href>/)?.[1] ?? '', body }));
  }

  private home(): string {
    return `${this.base}/remote.php/dav/calendars/${this.creds.user}`;
  }

  private auth(): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(`${this.creds.user}:${this.creds.password}`).toString('base64')}` };
  }

  private async request(method: string, url: string, contentType?: string, body?: string): Promise<void> {
    const headers = contentType ? { ...this.auth(), 'Content-Type': contentType } : this.auth();
    const res = await send(url, { method, headers, body });
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  }
}

/**
 * fetch, retried once when it lands on a keep-alive socket the server closed meanwhile (Apache
 * drops idle connections after a few seconds, and a flow keeps the client idle far longer). The
 * request never reached the server, so sending it again is safe.
 */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (e) {
    if ((e as { cause?: { code?: string } }).cause?.code !== 'UND_ERR_SOCKET') throw e;
    return fetch(url, init);
  }
}
