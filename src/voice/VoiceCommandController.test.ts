import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Model } from 'vosk-browser';
import { VoiceCommandController, type VoiceCommandControllerOptions } from './VoiceCommandController';

type EventName = 'partialresult' | 'result' | 'error';

class FakeRecognizer {
  readonly listeners = new Map<EventName, Array<(message: unknown) => void>>();
  readonly acceptWaveformFloat = vi.fn();
  readonly remove = vi.fn();

  on(event: EventName, listener: (message: never) => void): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as (message: unknown) => void);
    this.listeners.set(event, listeners);
  }

  emit(event: EventName, result: Record<string, unknown>): void {
    for (const listener of this.listeners.get(event) ?? []) listener({ result });
  }
}

function makeHarness(overrides: Partial<VoiceCommandControllerOptions> = {}) {
  const recognizers: FakeRecognizer[] = [];
  const constructions: Array<{ sampleRate: number; grammar?: string }> = [];
  const terminate = vi.fn();
  const Recognizer = class extends FakeRecognizer {
    constructor(sampleRate: number, grammar?: string) {
      super();
      constructions.push({ sampleRate, grammar });
      recognizers.push(this);
    }
  };
  const model = {
    KaldiRecognizer: Recognizer,
    terminate,
  } as unknown as Model;
  const options: VoiceCommandControllerOptions = {
    onCommand: vi.fn(),
    onDictation: vi.fn(),
    onTranscript: vi.fn(),
    onUnrecognized: vi.fn(),
    onStateChange: vi.fn(),
    onStatusChange: vi.fn(),
    onDictationModeChange: vi.fn(),
    onError: vi.fn(),
    modelLoader: vi.fn(async () => model),
    ...overrides,
  };
  return {
    controller: new VoiceCommandController(options),
    options,
    recognizers,
    constructions,
    terminate,
  };
}

async function startWithAudio(harness: ReturnType<typeof makeHarness>) {
  expect(harness.controller.start()).toBe(true);
  harness.controller.acceptAudio(new Float32Array([0.1, -0.1]), 48_000);
  await Promise.resolve();
  await Promise.resolve();
  expect(harness.recognizers).toHaveLength(1);
  return harness.recognizers[0]!;
}

describe('VoiceCommandController local recognition', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads one local model and starts a restricted command recognizer', async () => {
    vi.stubGlobal('Worker', class {});
    const harness = makeHarness();
    const recognizer = await startWithAudio(harness);

    expect(harness.options.modelLoader).toHaveBeenCalledWith('/models/vosk-small-en-in.model');
    expect(harness.constructions[0]?.sampleRate).toBe(48_000);
    expect(harness.constructions[0]?.grammar).toContain('"hold"');
    expect(harness.constructions[0]?.grammar).toContain('"rename"');
    expect(harness.constructions[0]?.grammar).toContain('"[unk]"');
    expect(harness.options.onStateChange).toHaveBeenLastCalledWith(true);
    expect(harness.options.onStatusChange).toHaveBeenLastCalledWith('listening');

    harness.controller.acceptAudio(new Float32Array([0.2]), 48_000);
    expect(recognizer.acceptWaveformFloat).toHaveBeenCalledWith(
      expect.any(Float32Array),
      48_000,
    );
  });

  it('fires an unambiguous partial command in under 100 ms', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', class {});
    const harness = makeHarness();
    const recognizer = await startWithAudio(harness);

    recognizer.emit('partialresult', { partial: 'hold' });
    vi.advanceTimersByTime(89);
    expect(harness.options.onCommand).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(harness.options.onCommand).toHaveBeenCalledWith(
      { type: 'hold', button: 'left' },
      'hold',
    );
  });

  it('lets a longer command replace an ambiguous prefix', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', class {});
    const harness = makeHarness();
    const recognizer = await startWithAudio(harness);

    recognizer.emit('partialresult', { partial: 'zoom' });
    vi.advanceTimersByTime(120);
    recognizer.emit('partialresult', { partial: 'zoom out' });
    vi.advanceTimersByTime(90);

    expect(harness.options.onCommand).toHaveBeenCalledTimes(1);
    expect(harness.options.onCommand).toHaveBeenCalledWith({ type: 'zoomOut' }, 'zoom out');
  });

  it('executes a final command immediately and suppresses its duplicate result', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('Worker', class {});
    const harness = makeHarness();
    const recognizer = await startWithAudio(harness);

    recognizer.emit('partialresult', { partial: 'release' });
    vi.advanceTimersByTime(90);
    recognizer.emit('result', { text: 'release' });

    expect(harness.options.onCommand).toHaveBeenCalledTimes(1);
    expect(harness.options.onCommand).toHaveBeenCalledWith({ type: 'release' }, 'release');
  });

  it('keeps Wispr control limited to rename and done commands', async () => {
    vi.stubGlobal('Worker', class {});
    const harness = makeHarness();
    const recognizer = await startWithAudio(harness);

    recognizer.emit('result', { text: 'rename' });
    recognizer.emit('result', { text: 'done' });

    expect(harness.options.onCommand).toHaveBeenNthCalledWith(1, { type: 'rename' }, 'rename');
    expect(harness.options.onCommand).toHaveBeenNthCalledWith(2, { type: 'finishRename' }, 'done');
    expect(harness.options.onDictation).not.toHaveBeenCalled();
  });

  it('reuses the loaded model after voice is toggled and terminates it on destroy', async () => {
    vi.stubGlobal('Worker', class {});
    const harness = makeHarness();
    const first = await startWithAudio(harness);
    harness.controller.stop();
    expect(first.remove).toHaveBeenCalledOnce();

    harness.controller.start();
    expect(harness.recognizers).toHaveLength(2);
    expect(harness.options.modelLoader).toHaveBeenCalledOnce();

    harness.controller.destroy();
    expect(harness.terminate).toHaveBeenCalledOnce();
  });
});
