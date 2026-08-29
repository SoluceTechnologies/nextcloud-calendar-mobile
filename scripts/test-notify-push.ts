/**
 * Proof-of-concept script: connect to a Nextcloud notify_push WebSocket,
 * authenticate, and listen for `calendar_sync` / `notify_notification` messages.
 *
 * Usage:
 *   node --strip-types scripts/test-notify-push.ts \
 *     --baseUrl http://localhost:8080 \
 *     --username admin \
 *     --password admin
 *
 * Optional:
 *   --trigger        create and immediately update a test calendar event
 *   --timeout 30000  stop listening after N milliseconds (default: 30000)
 */

type NotifyPushCapability = {
  type?: string[];
  endpoints?: {
    websocket?: string;
    pre_auth?: string;
  };
};

type NotifyPushMessage = {
  type: 'connected' | 'authenticated' | 'error' | 'message' | 'close';
  payload?: unknown;
  raw?: string;
};

function parseArgs(): {
  baseUrl: string;
  username: string;
  password: string;
  wsUrl?: string;
  trigger: boolean;
  timeout: number;
} {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback?: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
  };
  const has = (flag: string): boolean => args.includes(flag);

  const baseUrl = get('--baseUrl', 'http://localhost:8080');
  const username = get('--username', 'admin');
  const password = get('--password', 'admin');
  const wsUrl = get('--wsUrl');
  const trigger = has('--trigger');
  const timeout = Number(get('--timeout', '30000'));

  if (!baseUrl || !username || !password) {
    console.error(
      'Usage: node --strip-types scripts/test-notify-push.ts --baseUrl <url> --username <user> --password <pass> [--wsUrl <url>] [--trigger] [--timeout <ms>]',
    );
    process.exit(1);
  }

  return { baseUrl, username, password, wsUrl, trigger, timeout };
}

async function discoverWebSocketUrl(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string | null> {
  const url = `${baseUrl.replace(/\/$/, '')}/ocs/v2.php/cloud/capabilities`;
  const res = await fetch(url, {
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'OCS-APIRequest': 'true',
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    console.error(`Capabilities request failed: ${res.status} ${res.statusText}`);
    return null;
  }

  const json = (await res.json()) as {
    ocs?: { data?: { capabilities?: { notify_push?: NotifyPushCapability } } };
  };
  const cap = json?.ocs?.data?.capabilities?.notify_push;
  const wsUrl = cap?.endpoints?.websocket;

  if (!wsUrl) {
    console.error('notify_push websocket endpoint not found in capabilities');
    console.error(JSON.stringify(cap, null, 2));
    return null;
  }

  return wsUrl;
}

async function triggerCalendarChange(
  baseUrl: string,
  username: string,
  password: string,
): Promise<void> {
  // Find a calendar for the user via CalDAV PROPFIND.
  const davUrl = `${baseUrl.replace(/\/$/, '')}/remote.php/dav/calendars/${username}/`;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:resourcetype/>
    <d:displayname/>
    <cs:getctag/>
  </d:prop>
</d:propfind>`;

  const res = await fetch(davUrl, {
    method: 'PROPFIND',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type': 'text/xml; charset=utf-8',
      Depth: '1',
    },
    body,
  });

  if (!res.ok) {
    console.error(`PROPFIND failed: ${res.status} ${res.statusText}`);
    return;
  }

  const xml = await res.text();
  // Extract first response that is a calendar collection
  const responseChunks = xml.match(/<d:response[^>]*>([\s\S]*?)<\/d:response>/g) || [];
  let calendarHref: string | undefined;
  for (const chunk of responseChunks) {
    if (/<(?:cal|C):calendar[\s\/>]/.test(chunk)) {
      const hrefMatch = chunk.match(/<d:href>([^<]+)<\/d:href>/);
      if (hrefMatch) {
        calendarHref = hrefMatch[1].startsWith('/')
          ? hrefMatch[1]
          : new URL(hrefMatch[1], baseUrl).pathname;
        break;
      }
    }
  }
  if (!calendarHref) {
    console.error('No calendar collection found');
    console.error(xml);
    return;
  }
  const baseCalendarUrl = `${baseUrl.replace(/\/$/, '')}${calendarHref}`;
  const uid = `test-${Date.now()}`;
  const eventHref = `${baseCalendarUrl}${uid}.ics`;

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Nextcloud Calendar Mobile//Test//EN
BEGIN:VEVENT
UID:${uid}
SUMMARY:Notify Push Test Event
DTSTART:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z
DTEND:${new Date(Date.now() + 3600000).toISOString().replace(/[-:]/g, '').split('.')[0]}Z
END:VEVENT
END:VCALENDAR`;

  const putRes = await fetch(eventHref, {
    method: 'PUT',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type': 'text/calendar; charset=utf-8',
    },
    body: ics,
  });

  if (!putRes.ok) {
    console.error(`PUT event failed: ${putRes.status} ${putRes.statusText}`);
    return;
  }

  console.log(`Created test event at ${eventHref}`);

  // Update it to trigger an update event
  const icsUpdated = ics.replace('SUMMARY:Notify Push Test Event', 'SUMMARY:Notify Push Test Event UPDATED');
  const putRes2 = await fetch(eventHref, {
    method: 'PUT',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
      'Content-Type': 'text/calendar; charset=utf-8',
    },
    body: icsUpdated,
  });

  if (!putRes2.ok) {
    console.error(`PUT update failed: ${putRes2.status} ${putRes2.statusText}`);
    return;
  }

  console.log(`Updated test event at ${eventHref}`);
}

function listenForPushMessages(
  wsUrl: string,
  username: string,
  password: string,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    let authenticated = false;
    const timer = setTimeout(() => {
      console.log(`\n[timeout] closing connection after ${timeoutMs}ms`);
      socket.close();
      resolve();
    }, timeoutMs);

    socket.onopen = () => {
      console.log(`[ws] connected to ${wsUrl}`);
      socket.send(username);
      socket.send(password);
    };

    socket.onmessage = (event: MessageEvent) => {
      const text = event.data.toString();
      console.log(`[ws] raw: ${text}`);

      if (text === 'authenticated') {
        authenticated = true;
        console.log('[ws] authenticated');
        return;
      }

      // notify_push messages are space-separated: "<type> <json>"
      const spaceIdx = text.indexOf(' ');
      const messageType = spaceIdx === -1 ? text : text.slice(0, spaceIdx);
      const jsonPart = spaceIdx === -1 ? '' : text.slice(spaceIdx + 1);

      try {
        const payload = jsonPart ? JSON.parse(jsonPart) : undefined;
        console.log(`[ws] message type: ${messageType}`);
        console.log(`[ws] payload: ${JSON.stringify(payload, null, 2)}`);

        if (messageType === 'notify_custom' && payload?.message === 'calendar_sync') {
          console.log('[ws] >>> received calendar_sync <<<');
        }
      } catch (err) {
        console.log(`[ws] non-JSON message: ${text}`);
      }
    };

    socket.onerror = (err: Event) => {
      console.error('[ws] error', err);
      clearTimeout(timer);
      reject(err);
    };

    socket.onclose = () => {
      console.log('[ws] connection closed');
      clearTimeout(timer);
      resolve();
    };
  });
}

async function main(): Promise<void> {
  const { baseUrl, username, password, wsUrl: wsUrlOverride, trigger, timeout } = parseArgs();

  const discoveredWsUrl = await discoverWebSocketUrl(baseUrl, username, password);
  if (!discoveredWsUrl) {
    process.exit(1);
  }

  const wsUrl = wsUrlOverride ?? discoveredWsUrl;
  console.log(`[discover] notify_push websocket: ${discoveredWsUrl}`);
  if (wsUrlOverride) {
    console.log(`[discover] using override websocket: ${wsUrl}`);
  }

  if (trigger) {
    // Small delay so listener is established before we mutate data
    setTimeout(() => void triggerCalendarChange(baseUrl, username, password), 500);
  }

  await listenForPushMessages(wsUrl, username, password, timeout);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
