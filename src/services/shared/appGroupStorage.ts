import { requireOptionalNativeModule } from 'expo';

type AppGroupStorageNative = {
    setString(suite: string, key: string, value: string): void;
    getString(suite: string, key: string): string | null;
    remove(suite: string, key: string): void;
};

const mod = requireOptionalNativeModule<AppGroupStorageNative>('AppGroupStorage');

// iOS app group identifier shared with the widget extension and Siri intents —
// matches the entitlement in app.config.ts and WIDGET_MMKV_ID.
export const APP_GROUP_ID = 'group.com.soluce.nextcloud-calendar';

export const SHARED_KEYS = {
    voiceEnabled: 'voice.enabled',
    agendaSnapshot: 'voice.agendaSnapshot',
} as const;

export function setSharedString(key: string, value: string): void {
    try {
        mod?.setString(APP_GROUP_ID, key, value);
    } catch {
        // best effort — shared storage feeds Siri intents, never blocking
    }
}

export function getSharedString(key: string): string | null {
    try {
        return mod?.getString(APP_GROUP_ID, key) ?? null;
    } catch {
        return null;
    }
}

export function removeSharedString(key: string): void {
    try {
        mod?.remove(APP_GROUP_ID, key);
    } catch {
        // best effort
    }
}
