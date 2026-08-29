import JSEncrypt from 'jsencrypt';
import { sha512 as sha512Hex } from 'js-sha512';

const KEY_SIZE = 2048;

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

export function decryptPushSubject(encryptedBase64: string, privateKey: string): string {
  const crypt = new JSEncrypt();
  crypt.setPrivateKey(privateKey);
  const decrypted = crypt.decrypt(encryptedBase64);
  if (decrypted === false || decrypted == null) {
    throw new Error('Failed to decrypt push subject');
  }
  return decrypted;
}

export function decryptPushSubjectLegacy(encryptedBase64: string, privateKey: string): string {
  // Nextcloud push payload is base64 of RSA-OAEP encrypted bytes.
  // JSEncrypt.decrypt expects base64 input and returns the plaintext string.
  return decryptPushSubject(encryptedBase64, privateKey);
}
