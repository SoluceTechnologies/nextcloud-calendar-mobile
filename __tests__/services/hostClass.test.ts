import { classifyHost, isLocalHostname } from '@/services/shared/hostClass';

describe('classifyHost', () => {
  it.each([
    'localhost',
    '127.0.0.1',
    '10.0.0.5',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.50',
    '100.64.0.1',
    '169.254.10.10',
    '[::1]',
    '[fd00::1]',
    '[fc00::abcd]',
    '[fe80::1]',
    'nextcloud.local',
    'nc.home.arpa',
    'server.internal',
    'box.lan',
    'nextcloud',
  ])('treats %s as local', (host) => {
    expect(classifyHost(host)).toBe('local');
  });

  it.each([
    '203.0.113.5',
    '8.8.8.8',
    '172.32.0.1',
    '172.15.0.1',
    '100.128.0.1',
    '[2001:db8::1]',
    'cloud.example.com',
    'nextcloud.example.org',
    'example.local.com',
  ])('treats %s as public', (host) => {
    expect(classifyHost(host)).toBe('public');
  });

  it('is case-insensitive', () => {
    expect(classifyHost('NC.LOCAL')).toBe('local');
  });

  it('errs toward public on malformed input', () => {
    expect(classifyHost('999.999.999.999')).toBe('public');
    expect(classifyHost('')).toBe('public');
  });

  it('isLocalHostname is the boolean form', () => {
    expect(isLocalHostname('192.168.0.1')).toBe(true);
    expect(isLocalHostname('example.com')).toBe(false);
  });
});
