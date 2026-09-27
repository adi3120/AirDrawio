import { afterEach, describe, expect, it, vi } from 'vitest';
import { VoiceInputMonitor } from './VoiceInputMonitor';

describe('VoiceInputMonitor', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resumes Web Audio synchronously before microphone permission settles', async () => {
    let allowMicrophone!: (stream: MediaStream) => void;
    const getUserMedia = vi.fn(() => new Promise<MediaStream>((resolve) => {
      allowMicrophone = resolve;
    }));
    const stop = vi.fn();
    const stream = {
      getTracks: () => [{ stop }],
      getAudioTracks: () => [{ label: 'Built-in Microphone' }],
    } as unknown as MediaStream;
    const connect = vi.fn();
    const connectAnalyser = vi.fn();
    const disconnectSource = vi.fn();
    const disconnectAnalyser = vi.fn();
    const connectSink = vi.fn();
    const disconnectSink = vi.fn();
    const sink = {
      gain: { value: 1 },
      connect: connectSink,
      disconnect: disconnectSink,
    } as unknown as GainNode;
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      minDecibels: 0,
      maxDecibels: 0,
      connect: connectAnalyser,
      disconnect: disconnectAnalyser,
    } as unknown as AnalyserNode;

    class FakeAudioContext {
      state: AudioContextState = 'suspended';
      resume = vi.fn(async () => {
        this.state = 'running';
      });
      close = vi.fn(async () => {
        this.state = 'closed';
      });
      destination = {} as AudioDestinationNode;
      createMediaStreamSource = vi.fn(() => ({ connect, disconnect: disconnectSource } as unknown as MediaStreamAudioSourceNode));
      createAnalyser = vi.fn(() => analyser);
      createGain = vi.fn(() => sink);
    }

    const contexts: FakeAudioContext[] = [];
    vi.stubGlobal('AudioContext', class extends FakeAudioContext {
      constructor() {
        super();
        contexts.push(this);
      }
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });

    const monitor = new VoiceInputMonitor();
    const starting = monitor.start();

    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(contexts[0]?.resume).toHaveBeenCalledOnce();

    allowMicrophone(stream);
    await expect(starting).resolves.toMatchObject({ status: 'active', analyser, deviceLabel: 'Built-in Microphone' });
    expect(connect).toHaveBeenCalledWith(analyser);
    expect(connectAnalyser).toHaveBeenCalledWith(sink);
    expect(connectSink).toHaveBeenCalledWith(contexts[0]?.destination);
    expect(sink.gain.value).toBe(0);

    monitor.stop();
    expect(stop).toHaveBeenCalledOnce();
    expect(disconnectSource).toHaveBeenCalledOnce();
    expect(disconnectAnalyser).toHaveBeenCalledOnce();
    expect(disconnectSink).toHaveBeenCalledOnce();
  });
});
