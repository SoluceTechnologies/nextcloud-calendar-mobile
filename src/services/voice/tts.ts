import * as Speech from 'expo-speech';

export interface SpeakOptions {
    language?: string;
    rate?: number;
    onDone?: () => void;
    onError?: (e?: Error) => void;
}

// Speech.stop/pause/resume return Promises — discard them but never let a
// rejection go unhandled (Promise.resolve also shields undefined returns).
const discard = (p: Promise<void>): void => {
    void Promise.resolve(p).catch(() => {});
};

export function speak(text: string, opts?: SpeakOptions): void {
    try {
        Speech.speak(text, {
            language: opts?.language,
            rate: opts?.rate,
            onDone: opts?.onDone,
            onError: opts?.onError,
        });
    } catch (e) {
        if (__DEV__) console.warn('[tts] speak failed', e);
    }
}

export function stop(): void {
    discard(Speech.stop());
}

export function pause(): void {
    discard(Speech.pause());
}

export function resume(): void {
    discard(Speech.resume());
}

export function isSpeaking(): Promise<boolean> {
    return Speech.isSpeakingAsync();
}
