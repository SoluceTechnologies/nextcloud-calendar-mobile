import {
  hasCleartextConsent,
  addCleartextConsent,
  removeCleartextConsent,
  getCleartextConsents,
  isCleartextAllowed,
} from '@/services/shared/cleartextConsent';
import { storage } from '@/storage';

describe('cleartextConsent', () => {
  beforeEach(() => {
    storage.clearAll();
  });

  it('persists and reads back a consent', () => {
    expect(hasCleartextConsent('example.com:80')).toBe(false);
    addCleartextConsent('example.com:80');
    expect(hasCleartextConsent('example.com:80')).toBe(true);
    expect(getCleartextConsents()).toEqual({ 'example.com:80': true });
  });

  it('removes a consent', () => {
    addCleartextConsent('example.com:80');
    removeCleartextConsent('example.com:80');
    expect(getCleartextConsents()).toEqual({});
  });

  it('allows any https url without consent', () => {
    expect(isCleartextAllowed('https://example.com/dav')).toBe(true);
    expect(isCleartextAllowed('https://192.168.1.5:8443/dav')).toBe(true);
  });

  it('allows cleartext to local hosts without consent', () => {
    expect(isCleartextAllowed('http://192.168.1.50/dav')).toBe(true);
    expect(isCleartextAllowed('http://nc.local:8080/dav')).toBe(true);
  });

  it('refuses cleartext to a public host until consent is stored', () => {
    expect(isCleartextAllowed('http://203.0.113.5/dav')).toBe(false);
    addCleartextConsent('203.0.113.5:80');
    expect(isCleartextAllowed('http://203.0.113.5/dav')).toBe(true);
  });

  it('scopes consent to host and port', () => {
    addCleartextConsent('203.0.113.5:80');
    expect(isCleartextAllowed('http://203.0.113.5:8080/dav')).toBe(false);
  });

  it('does not block on an unparseable url', () => {
    expect(isCleartextAllowed('not a url')).toBe(true);
  });
});
