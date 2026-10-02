import { parseNotifyPushMessage } from '@/services/push/notifyPush';

describe('parseNotifyPushMessage', () => {
  it('returns authenticated for the auth handshake message', () => {
    expect(parseNotifyPushMessage('authenticated')).toEqual({
      type: 'authenticated',
      payload: undefined,
    });
  });

  it('parses calendar_sync with a calendarUrl payload', () => {
    const raw = 'calendar_sync {"calendarUrl":"/remote.php/dav/calendars/admin/personal/"}';
    expect(parseNotifyPushMessage(raw)).toEqual({
      type: 'calendar_sync',
      payload: { calendarUrl: '/remote.php/dav/calendars/admin/personal/' },
    });
  });

  it('parses notify_notification with a payload', () => {
    const raw = 'notify_notification {"id":42}';
    expect(parseNotifyPushMessage(raw)).toEqual({
      type: 'notify_notification',
      payload: { id: 42 },
    });
  });

  it('parses notify_activity without a payload', () => {
    expect(parseNotifyPushMessage('notify_activity')).toEqual({
      type: 'notify_activity',
      payload: undefined,
    });
  });

  it('returns the raw type when the payload is not valid json', () => {
    const raw = 'notify_custom not-json';
    expect(parseNotifyPushMessage(raw)).toEqual({
      type: 'notify_custom',
      payload: undefined,
    });
  });
});
