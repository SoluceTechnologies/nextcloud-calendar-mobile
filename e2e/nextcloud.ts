/// <reference types="node" />
import {
  AbstractStartedContainer,
  GenericContainer,
  Wait,
  getContainerRuntimeClient,
  type StartedTestContainer,
} from 'testcontainers';
import { prop, veventsOf } from './ics';

export interface Creds {
  user: string;
  password: string;
}

export const ADMIN: Creds = { user: 'e2e', password: 'Ncm-E2e-Passw0rd-2026' };
export const E2E_CAL = 'e2e-cal';
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

  override async start(): Promise<StartedNextcloud> {
    const nc = new StartedNextcloud(await super.start());
    await nc.installApp('calendar');
    await nc.disableBruteforceProtection();
    return nc;
  }
}

export class StartedNextcloud extends AbstractStartedContainer {
  readonly url: string;
  readonly emulatorUrl: string;
  readonly dav: CalDav;

  constructor(started: StartedTestContainer) {
    super(started);
    const port = started.getMappedPort(HTTP_PORT);
    this.url = `http://${started.getHost()}:${port}`;
    this.emulatorUrl = `http://10.0.2.2:${port}`;
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
    await (await this.runtime()).pause();
  }

  async unpause(): Promise<void> {
    await (await this.runtime()).unpause();
  }

  private async occ(args: string[], env: Record<string, string> = {}): Promise<void> {
    const { exitCode, output } = await this.exec(['php', 'occ', ...args], {
      user: 'www-data',
      workingDir: '/var/www/html',
      env,
    });
    if (exitCode !== 0) throw new Error(`occ ${args.join(' ')} → ${exitCode}\n${output}`);
  }

  private async runtime() {
    const client = await getContainerRuntimeClient();
    return client.container.getById(this.getId());
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
      const res = await fetch(`${this.home()}/${cal}/?export`, { headers: this.auth() });
      if (!res.ok) throw new Error(`GET ${cal}?export → ${res.status}`);
      const hits = veventsOf(await res.text()).filter((v) => prop(v, 'SUMMARY') === summary);
      if (hits.length) return hits.join('\r\n');
    }
    return null;
  }

  private async calendars(): Promise<string[]> {
    const res = await fetch(`${this.home()}/`, {
      method: 'PROPFIND',
      headers: { ...this.auth(), Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
      body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
    });
    if (res.status !== 207) throw new Error(`PROPFIND ${this.home()} → ${res.status}`);
    return (await res.text())
      .split(/<d:response>/)
      .filter((r) => /:calendar\s*\/>/.test(r))
      .map((r) => r.match(/<d:href>([^<]+)<\/d:href>/)?.[1] ?? '')
      .map((href) => href.replace(/\/$/, '').split('/').pop() ?? '')
      .filter(Boolean);
  }

  private home(): string {
    return `${this.base}/remote.php/dav/calendars/${this.creds.user}`;
  }

  private auth(): Record<string, string> {
    return { Authorization: `Basic ${Buffer.from(`${this.creds.user}:${this.creds.password}`).toString('base64')}` };
  }

  private async request(method: string, url: string, contentType?: string, body?: string): Promise<void> {
    const headers = contentType ? { ...this.auth(), 'Content-Type': contentType } : this.auth();
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  }
}
