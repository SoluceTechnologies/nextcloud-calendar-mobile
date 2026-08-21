import { requireNativeModule } from 'expo';

export type NativeRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyBase64?: string;
  timeoutMs: number;
};

export type NativeResult =
  | {
      type: 'response';
      status: number;
      headers: Record<string, string>;
      bodyBase64: string;
    }
  | {
      type: 'untrusted_cert';
      host: string;
      sha256: string;
      subject: string;
      issuer: string;
      notBefore: string;
      notAfter: string;
    };

export interface TlsTrustNative {
  setPins(pins: Record<string, string[]>): void;
  request(params: NativeRequest): Promise<NativeResult>;
}

export const TlsTrust: TlsTrustNative = requireNativeModule<TlsTrustNative>('TlsTrust');
