import { redirectSystemPath } from '../../app/+native-intent';

describe('redirectSystemPath', () => {
  it('rewrites a content:// .ics URI to the import route', () => {
    const result = redirectSystemPath({
      path: 'content://com.android.fileprovider/files/invite.ics',
      initial: true,
    });
    expect(result).toBe(
      '/event/import?uri=content%3A%2F%2Fcom.android.fileprovider%2Ffiles%2Finvite.ics',
    );
  });

  it('rewrites a file:// .ics URI to the import route', () => {
    const result = redirectSystemPath({
      path: 'file:///private/var/mobile/Inbox/meeting.ics',
      initial: true,
    });
    expect(result).toBe(
      '/event/import?uri=file%3A%2F%2F%2Fprivate%2Fvar%2Fmobile%2FInbox%2Fmeeting.ics',
    );
  });

  it('passes through app deep links unchanged', () => {
    const result = redirectSystemPath({
      path: 'nextcloud-calendar://settings',
      initial: true,
    });
    expect(result).toBe('nextcloud-calendar://settings');
  });

  it('passes through unrelated file types unchanged', () => {
    const result = redirectSystemPath({
      path: 'file:///storage/document.pdf',
      initial: true,
    });
    expect(result).toBe('file:///storage/document.pdf');
  });

  it('falls back to root on empty input', () => {
    expect(redirectSystemPath({ path: '', initial: true })).toBe('/');
  });
});
