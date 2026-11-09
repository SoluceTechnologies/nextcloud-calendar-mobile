import JSEncrypt from 'jsencrypt';
import { sha512 as sha512Hex } from 'js-sha512';
import forge from 'node-forge';

const KEY_SIZE = 2048;

export type PushPadding = 'oaep' | 'pkcs1';

export interface PushKeyPair {
  privateKey: string;
  publicKey: string;
}

export function generatePushKeyPair(): Promise<PushKeyPair> {
  return new Promise((resolve, reject) => {
    const crypt = new JSEncrypt({ default_key_size: String(KEY_SIZE) });
    setTimeout(() => {
      try {
        const privateKey = crypt.getPrivateKey();
        const publicKey = crypt.getPublicKey();
        if (!privateKey || !publicKey) throw new Error('Key generation failed');
        resolve({ privateKey, publicKey });
      } catch (err) {
        reject(err);
      }
    }, 0);
  });
}

export function sha512(input: string): string {
  return sha512Hex(input);
}

export function decryptPushSubjectOaep(encryptedBase64: string, privateKey: string): string {
  const bytes = forge.util.decode64(encryptedBase64);
  const key = forge.pki.privateKeyFromPem(privateKey);
  const decrypted = key.decrypt(bytes, 'RSA-OAEP', {
    md: forge.md.sha1.create(),
    mgf1: { md: forge.md.sha1.create() },
  });
  return forge.util.decodeUtf8(decrypted);
}

function decryptPushSubjectPkcs1(encryptedBase64: string, privateKey: string): string {
  const crypt = new JSEncrypt();
  crypt.setPrivateKey(privateKey);
  const decrypted = crypt.decrypt(encryptedBase64);
  if (decrypted === false || decrypted == null) {
    throw new Error('Failed to decrypt push subject');
  }
  return decrypted;
}

export function decryptPushSubject(encryptedBase64: string, privateKey: string): string {
  try {
    return decryptPushSubjectOaep(encryptedBase64, privateKey);
  } catch {
    return decryptPushSubjectPkcs1(encryptedBase64, privateKey);
  }
}
