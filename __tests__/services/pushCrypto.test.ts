import JSEncrypt from 'jsencrypt';
import forge from 'node-forge';
import {
  sha512,
  decryptPushSubject,
  decryptPushSubjectOaep,
} from '../../src/services/push/pushCrypto';

function encryptOaep(plaintext: string, publicKeyPem: string): string {
  const key = forge.pki.publicKeyFromPem(publicKeyPem);
  const encrypted = key.encrypt(plaintext, 'RSA-OAEP', {
    md: forge.md.sha1.create(),
    mgf1: { md: forge.md.sha1.create() },
  });
  return forge.util.encode64(encrypted);
}

describe('pushCrypto', () => {
  it('computes sha512 hex', () => {
    const hash = sha512('hello');
    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[a-f0-9]+$/);
  });

  it('decrypts a PKCS#1-encrypted subject via the fallback path', () => {
    const crypt = new JSEncrypt({ default_key_size: '512' });
    const publicKey = crypt.getPublicKey();
    const privateKey = crypt.getPrivateKey();
    const message = JSON.stringify({ nid: 42, app: 'calendar', subject: 'Event updated' });

    const encrypted = crypt.encrypt(message);
    expect(encrypted).toBeTruthy();

    const decrypted = decryptPushSubject(encrypted as string, privateKey);
    expect(JSON.parse(decrypted)).toEqual({ nid: 42, app: 'calendar', subject: 'Event updated' });
  });

  it('decrypts an RSA-OAEP/SHA-1 subject (NC35 default)', () => {
    const crypt = new JSEncrypt({ default_key_size: '1024' });
    const publicKey = crypt.getPublicKey();
    const privateKey = crypt.getPrivateKey();
    const message = JSON.stringify({ nid: 43, app: 'calendar', subject: 'Event created' });

    const encrypted = encryptOaep(message, publicKey);
    const decrypted = decryptPushSubjectOaep(encrypted, privateKey);
    expect(JSON.parse(decrypted)).toEqual({ nid: 43, app: 'calendar', subject: 'Event created' });
  });

  it('decrypts OAEP through the auto-detecting entry point', () => {
    const crypt = new JSEncrypt({ default_key_size: '1024' });
    const privateKey = crypt.getPrivateKey();
    const message = JSON.stringify({ nid: 44, delete: true });

    const decrypted = decryptPushSubject(encryptOaep(message, crypt.getPublicKey()), privateKey);
    expect(JSON.parse(decrypted)).toEqual({ nid: 44, delete: true });
  });

  it('throws when the private key does not match', () => {
    const crypt = new JSEncrypt({ default_key_size: '1024' });
    const other = new JSEncrypt({ default_key_size: '1024' });
    const encrypted = encryptOaep(JSON.stringify({ nid: 1 }), crypt.getPublicKey());

    expect(() => decryptPushSubject(encrypted, other.getPrivateKey())).toThrow();
  });

  it('throws on malformed base64 ciphertext', () => {
    const crypt = new JSEncrypt({ default_key_size: '1024' });
    expect(() => decryptPushSubject('!!!not-base64!!!', crypt.getPrivateKey())).toThrow();
  });
});
