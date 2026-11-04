import {
  cancelListening,
  getSttPermissions,
  isSttAvailable,
  requestSttPermissions,
  startListening,
  stopListening,
} from '../../../src/services/voice/stt';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

type Listener = (ev?: unknown) => void;

const mock = ExpoSpeechRecognitionModule as unknown as {
  start: jest.Mock;
  stop: jest.Mock;
  abort: jest.Mock;
  addListener: jest.Mock;
  requestPermissionsAsync: jest.Mock;
  getPermissionsAsync: jest.Mock;
  isRecognitionAvailable: jest.Mock;
};

let listeners: Record<string, Listener>;

const removals = (): jest.Mock[] =>
  mock.addListener.mock.results.map((r) => (r.value as { remove: jest.Mock }).remove);

beforeEach(() => {
  cancelListening(); // reset module session state
  jest.clearAllMocks();
  listeners = {};
  mock.addListener.mockImplementation((event: string, cb: Listener) => {
    listeners[event] = cb;
    return { remove: jest.fn() };
  });
});

describe('isSttAvailable', () => {
  it('reflects isRecognitionAvailable()', () => {
    expect(isSttAvailable()).toBe(true);
    mock.isRecognitionAvailable.mockReturnValueOnce(false);
    expect(isSttAvailable()).toBe(false);
  });

  it('returns false when the module throws', () => {
    mock.isRecognitionAvailable.mockImplementationOnce(() => {
      throw new Error('no module');
    });
    expect(isSttAvailable()).toBe(false);
  });
});

describe('permissions', () => {
  it('maps getPermissionsAsync to {granted, canAskAgain}', async () => {
    mock.getPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: true,
      status: 'denied',
    });
    await expect(getSttPermissions()).resolves.toEqual({ granted: false, canAskAgain: true });
  });

  it('requestSttPermissions resolves to granted', async () => {
    await expect(requestSttPermissions()).resolves.toBe(true);
    mock.requestPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      canAskAgain: false,
      status: 'denied',
    });
    await expect(requestSttPermissions()).resolves.toBe(false);
  });
});

describe('startListening', () => {
  it('starts with interim results, non-continuous and the given locale', () => {
    startListening({ locale: 'fr-FR', onResult: jest.fn() });
    expect(mock.start).toHaveBeenCalledWith({
      lang: 'fr-FR',
      interimResults: true,
      continuous: false,
    });
    expect(mock.addListener).toHaveBeenCalledTimes(3);
    expect(mock.addListener.mock.calls.map((c) => c[0])).toEqual(['result', 'error', 'end']);
  });

  it('falls back to the device locale', () => {
    startListening({ onResult: jest.fn() });
    expect(mock.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US' }),
    );
  });

  it('routes partial results to onPartial and final ones to onResult', () => {
    const onPartial = jest.fn();
    const onResult = jest.fn();
    startListening({ onResult, onPartial });

    listeners.result({ isFinal: false, results: [{ transcript: 'bon', confidence: 0 }] });
    expect(onPartial).toHaveBeenCalledWith('bon');
    expect(onResult).not.toHaveBeenCalled();

    listeners.result({ isFinal: true, results: [{ transcript: 'bonjour', confidence: 0.9 }] });
    expect(onResult).toHaveBeenCalledWith('bonjour');
  });

  it('ignores empty transcripts', () => {
    const onResult = jest.fn();
    startListening({ onResult });
    listeners.result({ isFinal: true, results: [] });
    listeners.result({ isFinal: true, results: [{ transcript: '', confidence: 0 }] });
    expect(onResult).not.toHaveBeenCalled();
  });

  it('maps error events to Error `${error}: ${message}`', () => {
    const onError = jest.fn();
    startListening({ onResult: jest.fn(), onError });
    listeners.error({ error: 'no-speech', message: 'No speech detected' });
    expect(onError).toHaveBeenCalledTimes(1);
    const err = onError.mock.calls[0][0] as Error;
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('no-speech: No speech detected');
  });

  it('reports a synchronous start() failure via onError', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mock.start.mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const onError = jest.fn();
    startListening({ onResult: jest.fn(), onError });
    expect(onError).toHaveBeenCalledTimes(1);
    expect((onError.mock.calls[0][0] as Error).message).toBe('boom');
    warn.mockRestore();
  });

  it('keeps a single active session — prior listeners are removed and go inert', () => {
    const first = { onResult: jest.fn(), onPartial: jest.fn() };
    startListening(first);
    const firstListeners = { ...listeners };
    const firstRemovals = removals();

    startListening({ onResult: jest.fn() });

    firstRemovals.forEach((r) => expect(r).toHaveBeenCalled());
    expect(mock.addListener).toHaveBeenCalledTimes(6);
    firstListeners.result({ isFinal: true, results: [{ transcript: 'stale', confidence: 1 }] });
    expect(first.onResult).not.toHaveBeenCalled();
  });
});

describe('stopListening', () => {
  it('stops gracefully — a final result may still arrive', () => {
    const onResult = jest.fn();
    startListening({ onResult });
    stopListening();
    expect(mock.stop).toHaveBeenCalledTimes(1);
    listeners.result({ isFinal: true, results: [{ transcript: 'final', confidence: 1 }] });
    expect(onResult).toHaveBeenCalledWith('final');
  });

  it('is a no-op when idle', () => {
    stopListening();
    expect(mock.stop).not.toHaveBeenCalled();
  });

  it('is a no-op after the session already ended', () => {
    startListening({ onResult: jest.fn() });
    listeners.end();
    stopListening();
    expect(mock.stop).not.toHaveBeenCalled();
  });
});

describe('cancelListening', () => {
  it('removes listeners, aborts and drops pending callbacks', () => {
    const onResult = jest.fn();
    const onError = jest.fn();
    startListening({ onResult, onError });
    const captured = { ...listeners };
    const subs = removals();

    cancelListening();

    subs.forEach((r) => expect(r).toHaveBeenCalled());
    expect(mock.abort).toHaveBeenCalledTimes(1);
    captured.result({ isFinal: true, results: [{ transcript: 'late', confidence: 1 }] });
    captured.error({ error: 'aborted', message: 'x' });
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('is a no-op when idle', () => {
    cancelListening();
    expect(mock.abort).not.toHaveBeenCalled();
  });
});
