import { parseNcLoginUrl } from '../../src/features/account/utils/ncLoginUrl';

describe('parseNcLoginUrl', () => {
  it('parses a standard app-password QR payload', () => {
    const parsed = parseNcLoginUrl(
      'nc://login/user:john&password:abcd-efgh&server:https://cloud.example.com'
    );

    expect(parsed).toEqual({
      user: 'john',
      password: 'abcd-efgh',
      server: 'https://cloud.example.com',
      oneTime: false,
    });
  });

  it('flags a one-time QR payload as oneTime', () => {
    const parsed = parseNcLoginUrl(
      'nc://onetime-login/user:john&password:onetimetoken&server:https://cloud.example.com/'
    );

    expect(parsed).toEqual({
      user: 'john',
      password: 'onetimetoken',
      server: 'https://cloud.example.com',
      oneTime: true,
    });
  });

  it('decodes PHP-urlencoded login name and password', () => {
    const parsed = parseNcLoginUrl(
      'nc://login/user:john+doe%40example.com&password:pa%2Bss+word&server:https://cloud.example.com'
    );

    expect(parsed?.user).toBe('john doe@example.com');
    expect(parsed?.password).toBe('pa+ss word');
  });

  it('returns null for a non-nc payload or missing fields', () => {
    expect(parseNcLoginUrl('https://cloud.example.com')).toBeNull();
    expect(parseNcLoginUrl('nc://login/user:john&server:https://cloud.example.com')).toBeNull();
    expect(parseNcLoginUrl('nc://other-login/user:john&password:x&server:https://c.example.com')).toBeNull();
  });
});
