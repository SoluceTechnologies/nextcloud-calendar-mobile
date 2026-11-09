import { requireOptionalNativeModule } from 'expo';

type AppGroupStorageNative = {
    setString(suite: string, key: string, value: string): void;
    getString(suite: string, key: string): string | null;
    remove(suite: string, key: string): void;
};

const mod = requireOptionalNativeModule<AppGroupStorageNative>('AppGroupStorage');

export function setSharedString(suite: string, key: string, value: string): void {
    try {
        mod?.setString(suite, key, value);
    } catch {
        // best effort — shared storage is a hint for Siri intents, never blocking
    }
}

export function getSharedString(suite: string, key: string): string | null {
    try {
        return mod?.getString(suite, key) ?? null;
    } catch {
        return null;
    }
}

export function removeSharedString(suite: string, key: string): void {
    try {
        mod?.remove(suite, key);
    } catch {
        // best effort
    }
}
