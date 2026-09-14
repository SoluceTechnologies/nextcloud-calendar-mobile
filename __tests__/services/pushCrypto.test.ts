import JSEncrypt from 'jsencrypt';
import { sha512, decryptPushSubject } from '../../src/services/push/pushCrypto';

describe('pushCrypto', () => {
  it('computes sha512 hex', () => {
    const hash = sha512('hello');
    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('decrypts a subject with the matching private key', () => {
    const crypt = new JSEncrypt({ default_key_size: '512' });
    const publicKey = crypt.getPublicKey();
    const privateKey = crypt.getPrivateKey();
    const message = JSON.stringify({ nid: 42, app: 'calendar', subject: 'Event updated' });

    const encrypted = crypt.encrypt(message);
    expect(encrypted).toBeTruthy();

    const decrypted = decryptPushSubject(encrypted as string, privateKey);
    expect(JSON.parse(decrypted)).toEqual({ nid: 42, app: 'calendar', subject: 'Event updated' });
  });
});
