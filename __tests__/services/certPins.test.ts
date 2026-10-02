import {
  hostKeyFromUrl,
  getPins,
  hasPin,
  addPin,
  removePinsForHost,
  pushPinsToNative,
} from '@/services/shared/certPins';
import { storage } from '@/storage';
import { TlsTrust } from '@/services/shared/nativeTlsTrust';

describe('certPins', () => {
  beforeEach(() => {
    storage.clearAll();
    jest.clearAllMocks();
  });

  it('derives hostname:port with explicit default ports', () => {
    expect(hostKeyFromUrl('https://192.168.178.30/')).toBe('192.168.178.30:443');
    expect(hostKeyFromUrl('http://nc.local/x')).toBe('nc.local:80');
    expect(hostKeyFromUrl('https://nc.local:8443/dav')).toBe('nc.local:8443');
  });

  it('adds, checks and persists a pin, and pushes to native', () => {
    addPin('192.168.178.30:443', 'AA:BB');
    expect(hasPin('192.168.178.30:443', 'AA:BB')).toBe(true);
    expect(hasPin('192.168.178.30:443', 'ZZ')).toBe(false);
    expect(getPins()).toEqual({ '192.168.178.30:443': ['AA:BB'] });
    expect(TlsTrust.setPins).toHaveBeenLastCalledWith({ '192.168.178.30:443': ['AA:BB'] });
  });

  it('does not duplicate an existing pin', () => {
    addPin('h:443', 'AA');
    addPin('h:443', 'AA');
    expect(getPins()).toEqual({ 'h:443': ['AA'] });
  });

  it('removes all pins for a host', () => {
    addPin('h:443', 'AA');
    removePinsForHost('h:443');
    expect(getPins()).toEqual({});
    expect(TlsTrust.setPins).toHaveBeenLastCalledWith({});
  });

  it('pushPinsToNative loads persisted pins into the native module', () => {
    storage.set('cert_pins', JSON.stringify({ 'a:443': ['X'], 'b:443': ['Y'] }));
    pushPinsToNative();
    expect(TlsTrust.setPins).toHaveBeenLastCalledWith({ 'a:443': ['X'], 'b:443': ['Y'] });
  });
});
