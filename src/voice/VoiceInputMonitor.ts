export type VoiceInputStatus = 'idle' | 'requesting' | 'active' | 'suspended' | 'denied' | 'error';

export interface VoiceInputState {
  status: VoiceInputStatus;
  analyser: AnalyserNode | null;
  deviceLabel?: string;
  message?: string;
}

export interface VoiceInputMonitorOptions {
  onAudioFrame?(samples: Float32Array, sampleRate: number): void;
}

export class VoiceInputMonitor {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private silentSink: GainNode | null = null;
  private processor: ScriptProcessorNode | null = null;

  constructor(private readonly options: VoiceInputMonitorOptions = {}) {}

  async start(): Promise<VoiceInputState> {
    if (this.analyser) return { status: 'active', analyser: this.analyser };

    try {
      // Creating the context before the permission promise settles preserves the
      // browser user-activation path when Voice + Camera is started by a click.
      this.context = new AudioContext({ latencyHint: 'interactive' });
      // resume() must also be invoked before the first await. Chrome can reject or
      // indefinitely suspend a later resume once the original click activation is
      // gone, which leaves an otherwise valid analyser returning a flat 128 signal.
      const initialResume = this.context.state === 'suspended'
        ? this.context.resume().catch(() => undefined)
        : Promise.resolve();
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          // This stream feeds both the oscilloscope and local Vosk worker but
          // is never played back. Keep it raw so Chrome does not suppress quiet
          // speech into a visually flat signal before local decoding sees it.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 1,
        },
        video: false,
      });
      await initialResume;
      if (this.context.state === 'suspended') {
        await this.context.resume().catch(() => undefined);
      }

      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.76;
      this.analyser.minDecibels = -92;
      this.analyser.maxDecibels = -12;
      // Keep the analyser in Chrome's active render graph. With no downstream
      // node, Chromium may cull the branch and return a permanent zero signal.
      // A zero-gain sink drives processing without monitoring the microphone.
      this.silentSink = this.context.createGain();
      this.silentSink.gain.value = 0;
      this.source.connect(this.analyser);
      this.analyser.connect(this.silentSink);
      if (this.options.onAudioFrame) {
        // A 2048-frame buffer is about 43 ms at 48 kHz. It is small enough for
        // responsive partial commands while avoiding a message per render tick.
        this.processor = this.context.createScriptProcessor(2048, 1, 1);
        this.processor.onaudioprocess = (event) => {
          const channel = event.inputBuffer.getChannelData(0);
          this.options.onAudioFrame?.(
            channel,
            event.inputBuffer.sampleRate || this.context?.sampleRate || 48_000,
          );
        };
        this.source.connect(this.processor);
        this.processor.connect(this.silentSink);
      }
      this.silentSink.connect(this.context.destination);
      const deviceLabel = this.stream.getAudioTracks()[0]?.label || 'Default microphone';

      if (this.context.state !== 'running') {
        return {
          status: 'suspended',
          analyser: this.analyser,
          deviceLabel,
          message: 'Microphone is allowed, but audio processing is paused. Select Retry microphone once.',
        };
      }

      return { status: 'active', analyser: this.analyser, deviceLabel };
    } catch (error) {
      this.stop();
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      return {
        status: denied ? 'denied' : 'error',
        analyser: null,
        message: denied
          ? 'Microphone access was denied. Allow it in the browser, then retry.'
          : error instanceof Error
            ? error.message
            : 'The microphone could not be started.',
      };
    }
  }

  stop(): void {
    if (this.processor) this.processor.onaudioprocess = null;
    this.processor?.disconnect();
    this.processor = null;
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.silentSink?.disconnect();
    this.silentSink = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
  }
}
