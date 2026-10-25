import {
  createDirectEditingUrl,
  editorForMime,
  fetchDirectEditing,
  fetchDirectEditors,
  officeUserAgent,
  openDirectEditingUrl,
  usesOfficeUserAgent,
  type DirectEditor,
} from '../../src/services/nextcloud/directEditing';
import { trustedFetch } from '../../src/services/shared/trustedFetch';
import type { Account } from '../../src/types';

jest.mock('../../src/services/shared/trustedFetch', () => ({
  trustedFetch: jest.fn(),
}));

const mockedFetch = trustedFetch as jest.MockedFunction<typeof trustedFetch>;

const account = {
  baseUrl: 'https://cloud.example.com/',
  username: 'alice',
  appPassword: 'pw',
  davUserId: 'alice',
} as Account;

function ocsOk(data: unknown) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ocs: { meta: { status: 'ok' }, data } }),
  } as unknown as Awaited<ReturnType<typeof trustedFetch>>;
}

describe('fetchDirectEditors', () => {
  it('parses the editors map into a list', async () => {
    mockedFetch.mockResolvedValue(
      ocsOk({
        editors: {
          text: {
            id: 'text',
            name: 'Nextcloud Text',
            mimetypes: ['text/markdown', 'text/plain'],
            optionalMimetypes: ['text/html'],
          },
        },
      }),
    );

    const editors = await fetchDirectEditors(account);

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/files/api/v1/directEditing',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(editors).toEqual([
      {
        id: 'text',
        name: 'Nextcloud Text',
        mimetypes: ['text/markdown', 'text/plain'],
        optionalMimetypes: ['text/html'],
      },
    ]);
  });

  it('returns [] when the server exposes no editors', async () => {
    mockedFetch.mockResolvedValue(ocsOk({ editors: {} }));
    expect(await fetchDirectEditors(account)).toEqual([]);
  });

  it('tolerates missing optional fields', async () => {
    mockedFetch.mockResolvedValue(ocsOk({ editors: { x: { id: 'x' } } }));
    expect(await fetchDirectEditors(account)).toEqual([
      { id: 'x', name: '', mimetypes: [], optionalMimetypes: [] },
    ]);
  });

  it('throws on HTTP errors', async () => {
    mockedFetch.mockResolvedValue({ ok: false, status: 503 } as never);
    await expect(fetchDirectEditors(account)).rejects.toThrow('503');
  });
});

describe('editorForMime', () => {
  const editors: DirectEditor[] = [
    {
      id: 'text',
      name: 'Text',
      mimetypes: ['text/markdown'],
      optionalMimetypes: ['text/html'],
    },
    { id: 'rich', name: 'Rich', mimetypes: ['application/pdf'], optionalMimetypes: [] },
  ];

  it('matches primary and optional mimetypes', () => {
    expect(editorForMime(editors, 'text/markdown')?.id).toBe('text');
    expect(editorForMime(editors, 'text/html')?.id).toBe('text');
    expect(editorForMime(editors, 'application/pdf')?.id).toBe('rich');
  });

  it('returns null for unknown or missing mimes', () => {
    expect(editorForMime(editors, 'image/png')).toBeNull();
    expect(editorForMime(editors, undefined)).toBeNull();
    expect(editorForMime([], 'text/plain')).toBeNull();
  });
});

describe('openDirectEditingUrl', () => {
  it('posts the file path and returns the one-time URL', async () => {
    mockedFetch.mockResolvedValue(
      ocsOk({ url: 'https://cloud.example.com/apps/files/directEditing/tok123' }),
    );

    const url = await openDirectEditingUrl(account, '/Calendar/note.md', 'text');

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/files/api/v1/directEditing/open',
      expect.objectContaining({
        method: 'POST',
        body: 'path=%2FCalendar%2Fnote.md&editorId=text',
      }),
    );
    expect(url).toBe('https://cloud.example.com/apps/files/directEditing/tok123');
  });

  it('omits editorId when not given', async () => {
    mockedFetch.mockResolvedValue(ocsOk({ url: 'https://x/u' }));
    await openDirectEditingUrl(account, '/a.txt');
    const init = mockedFetch.mock.calls.at(-1)?.[1] as { body?: string };
    expect(init.body).toBe('path=%2Fa.txt');
  });

  it('rejects a malformed OCS payload', async () => {
    mockedFetch.mockResolvedValue(ocsOk({}));
    await expect(openDirectEditingUrl(account, '/a.txt')).rejects.toThrow(
      'malformed',
    );
  });
});

describe('fetchDirectEditing creators', () => {
  it('parses the creators map', async () => {
    mockedFetch.mockResolvedValue(
      ocsOk({
        editors: {},
        creators: {
          textdocument: {
            id: 'textdocument',
            editor: 'text',
            name: 'Text document',
            extension: 'md',
            templates: false,
            mimetype: 'text/markdown',
          },
        },
      }),
    );
    const caps = await fetchDirectEditing(account);
    expect(caps.creators).toEqual([
      {
        id: 'textdocument',
        editor: 'text',
        name: 'Text document',
        extension: 'md',
        mimetype: 'text/markdown',
        templates: false,
      },
    ]);
    expect(caps.editors).toEqual([]);
  });
});

describe('createDirectEditingUrl', () => {
  it('posts path, editorId and creatorId', async () => {
    mockedFetch.mockResolvedValue(ocsOk({ url: 'https://x/edit/abc' }));
    const url = await createDirectEditingUrl(
      account,
      '/Calendar/note.md',
      'text',
      'textdocument',
    );
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://cloud.example.com/ocs/v2.php/apps/files/api/v1/directEditing/create',
      expect.objectContaining({
        method: 'POST',
        body: 'path=%2FCalendar%2Fnote.md&editorId=text&creatorId=textdocument',
      }),
    );
    expect(url).toBe('https://x/edit/abc');
  });
});

describe('office user agent', () => {
  it('flags onlyoffice and eurooffice editors only', () => {
    expect(usesOfficeUserAgent('onlyoffice')).toBe(true);
    expect(usesOfficeUserAgent('eurooffice')).toBe(true);
    expect(usesOfficeUserAgent('richdocuments')).toBe(false);
    expect(usesOfficeUserAgent('text')).toBe(false);
    expect(usesOfficeUserAgent(undefined)).toBe(false);
  });

  it('builds a mobile UA carrying the app version', () => {
    expect(officeUserAgent('1.8.0')).toBe(
      'Mozilla/5.0 (Android) Mobile Nextcloud-calendar/1.8.0',
    );
  });
});
