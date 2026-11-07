import { getLocales } from 'expo-localization';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

export interface SttCallbacks {
    onPartial?: (text: string) => void;
    onResult: (text: string) => void;
    onError?: (e: Error) => void;
}

type Sub = ReturnType<typeof ExpoSpeechRecognitionModule.addListener>;

let subs: Sub[] = [];
let active = false;
// Bumped whenever the session is dropped — stale listeners then no-op.
let generation = 0;
// locales whose offline-pack download was already requested this session — the
// system opens a modal download dialog each time, so ask once per locale.
const requestedPacks = new Set<string>();

const dropSession = (): void => {
    generation += 1;
    for (const s of subs) s.remove();
    subs = [];
    active = false;
};

export function isSttAvailable(): boolean {
    try {
        return ExpoSpeechRecognitionModule.isRecognitionAvailable();
    } catch {
        return false;
    }
}

export function supportsOnDeviceRecognition(): boolean {
    try {
        return ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
    } catch {
        return false;
    }
}

export async function getSttPermissions(): Promise<{ granted: boolean; canAskAgain: boolean }> {
    const res = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    return { granted: res.granted, canAskAgain: res.canAskAgain };
}

export async function requestSttPermissions(): Promise<boolean> {
    const res = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    return res.granted;
}

export function startListening(opts: { locale?: string; onDevice?: boolean } & SttCallbacks): void {
    dropSession();
    const gen = generation;
    const lang = opts.locale ?? getLocales()[0]?.languageTag;
    let retried = false;
    const start = (onDevice: boolean): void => {
        try {
            ExpoSpeechRecognitionModule.start({
                lang,
                interimResults: true,
                continuous: false,
                requiresOnDeviceRecognition: onDevice,
            });
        } catch (e) {
            dropSession();
            if (__DEV__) console.warn('[stt] start failed', e);
            opts.onError?.(e instanceof Error ? e : new Error(String(e)));
        }
    };
    active = true;
    subs = [
        ExpoSpeechRecognitionModule.addListener('result', (ev) => {
            if (gen !== generation) return;
            const text = ev.results[0]?.transcript;
            if (!text) return;
            if (ev.isFinal) opts.onResult(text);
            else opts.onPartial?.(text);
        }),
        ExpoSpeechRecognitionModule.addListener('error', (ev) => {
            if (gen !== generation) return;
            if (opts.onDevice === true && !retried && ev.error === 'language-not-supported') {
                retried = true;
                if (lang && !requestedPacks.has(lang)) {
                    requestedPacks.add(lang);
                    try {
                        void ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({
                            locale: lang,
                        }).catch(() => {});
                    } catch {
                        // pack download is best-effort (iOS / older Android)
                    }
                }
                start(false);
                return;
            }
            opts.onError?.(new Error(`${ev.error}: ${ev.message}`));
        }),
        ExpoSpeechRecognitionModule.addListener('end', () => {
            if (gen !== generation) return;
            active = false;
        }),
    ];
    start(opts.onDevice === true);
}

export function stopListening(): void {
    if (!active) return;
    try {
        ExpoSpeechRecognitionModule.stop();
    } catch (e) {
        if (__DEV__) console.warn('[stt] stop failed', e);
    }
}

export function cancelListening(): void {
    const wasActive = active;
    dropSession();
    if (!wasActive) return;
    try {
        ExpoSpeechRecognitionModule.abort();
    } catch (e) {
        if (__DEV__) console.warn('[stt] abort failed', e);
    }
}
