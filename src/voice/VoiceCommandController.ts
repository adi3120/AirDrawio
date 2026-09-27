import type { KaldiRecognizer, Model } from 'vosk-browser';
import {
  isVoiceCommandPrefix,
  LOCAL_VOICE_COMMAND_PHRASES,
  normalizeVoicePhrase,
  parseVoiceCommands,
  type VoiceCommand,
} from './voiceCommandModel';

export type VoiceRecognitionStatus =
  | 'idle'
  | 'starting'
  | 'recovering'
  | 'listening'
  | 'blocked'
  | 'unsupported'
  | 'error';

export interface VoiceCommandControllerOptions {
  language?: string;
  onCommand(command: VoiceCommand, transcript: string): void;
  onDictation(transcript: string): void;
  onTranscript(transcript: string): void;
  onUnrecognized?(transcript: string): void;
  onStateChange(listening: boolean): void;
  onStatusChange(status: VoiceRecognitionStatus): void;
  onDictationModeChange(active: boolean): void;
  onError(message: string): void;
  onRecovery?(message: string): void;
  modelUrl?: string;
  modelLoader?: (url: string) => Promise<Model>;
}

// Do not use a .gz suffix here. Vite/Chrome otherwise advertise the archive
// with Content-Encoding: gzip and transparently strip the gzip layer before
// Vosk's worker receives it. The file is still a gzipped tar archive.
const MODEL_URL = '/models/vosk-small-en-in.model';
const FAST_PARTIAL_SETTLE_MS = 90;
const PREFIX_PARTIAL_SETTLE_MS = 260;
const DUPLICATE_COMMAND_WINDOW_MS = 850;

type RecognizerMessage = {
  result?: {
    text?: string;
    partial?: string;
  };
};

/**
 * Always-on, browser-local command recognition.
 *
 * Audio is decoded by Vosk in a Web Worker. The deliberately small grammar
 * prevents ordinary room speech from being treated as diagram commands and
 * lets short commands arrive from partial results instead of waiting for a
 * cloud recognizer or an end-of-utterance timeout.
 */
export class VoiceCommandController {
  private model: Model | null = null;
  private recognizer: KaldiRecognizer | null = null;
  private modelPromise: Promise<Model> | null = null;
  private enabled = false;
  private dictating = false;
  private destroyed = false;
  private sampleRate: number | null = null;
  private partialTimer: number | null = null;
  private pendingPartial = '';
  private lastExecutedPhrase = '';
  private lastExecutedAt = -Infinity;

  constructor(private readonly options: VoiceCommandControllerOptions) {}

  isSupported(): boolean {
    return typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined';
  }

  start(): boolean {
    if (this.destroyed || !this.isSupported()) {
      this.options.onStatusChange('unsupported');
      this.options.onError('Local voice commands are not supported in this browser.');
      return false;
    }
    if (this.enabled) return true;
    this.enabled = true;
    this.options.onStatusChange('starting');
    void this.ensureModel();
    this.attachRecognizer();
    return true;
  }

  stop(): void {
    this.enabled = false;
    this.clearPartialTimer();
    this.removeRecognizer();
    this.setDictationMode(false);
    this.options.onStateChange(false);
    this.options.onStatusChange('idle');
  }

  setDictationMode(active: boolean): void {
    if (this.dictating === active) return;
    this.dictating = active;
    this.options.onDictationModeChange(active);
  }

  isDictating(): boolean {
    return this.dictating;
  }

  /**
   * Feed microphone PCM directly into the local recognizer. The samples never
   * leave the page; Vosk copies them to its in-browser WebAssembly worker.
   */
  acceptAudio(samples: Float32Array, sampleRate: number): void {
    if (!this.enabled || this.destroyed || !samples.length || !Number.isFinite(sampleRate)) return;
    if (this.sampleRate !== sampleRate) {
      this.sampleRate = sampleRate;
      if (this.recognizer) this.removeRecognizer();
      this.attachRecognizer();
    }
    this.recognizer?.acceptWaveformFloat(samples, sampleRate);
  }

  // Kept as a compatibility no-op for the voice graph's health sampler. Local
  // recognition consumes the same PCM stream and does not need Chrome restarts.
  reportAudioLevel(_rms: number, _timestamp = performance.now()): void {}

  destroy(): void {
    if (this.destroyed) return;
    this.stop();
    this.destroyed = true;
    this.model?.terminate();
    this.model = null;
    this.modelPromise = null;
  }

  private async ensureModel(): Promise<void> {
    if (this.model || this.modelPromise || this.destroyed) return;
    const modelUrl = this.options.modelUrl ?? MODEL_URL;
    const loadModel = this.options.modelLoader ?? (async (url: string) => {
      const { createModel } = await import('vosk-browser');
      return createModel(url, -1);
    });

    this.modelPromise = loadModel(modelUrl);
    try {
      const model = await this.modelPromise;
      if (this.destroyed) {
        model.terminate();
        return;
      }
      this.model = model;
      this.attachRecognizer();
    } catch (error) {
      if (!this.enabled || this.destroyed) return;
      this.options.onStateChange(false);
      this.options.onStatusChange('error');
      this.options.onError(
        error instanceof Error
          ? `Local voice model could not load: ${error.message}`
          : 'Local voice model could not load.',
      );
    } finally {
      this.modelPromise = null;
    }
  }

  private attachRecognizer(): void {
    if (!this.enabled || !this.model || this.recognizer || !this.sampleRate) return;
    try {
      // [unk] is essential: without it, unrelated speech is forced to the
      // acoustically nearest command. The grammar still strongly boosts the
      // actual commands and their common variants.
      const grammar = JSON.stringify([...LOCAL_VOICE_COMMAND_PHRASES, '[unk]']);
      const recognizer = new this.model.KaldiRecognizer(this.sampleRate, grammar);
      recognizer.on('partialresult', (message) => {
        const transcript = (message as RecognizerMessage).result?.partial?.trim();
        if (transcript) this.handleTranscript(transcript, false);
      });
      recognizer.on('result', (message) => {
        const transcript = (message as RecognizerMessage).result?.text?.trim();
        if (transcript) this.handleTranscript(transcript, true);
      });
      recognizer.on('error', (message) => {
        if (!this.enabled) return;
        const detail = 'error' in message ? message.error : 'unknown decoder error';
        this.options.onStatusChange('error');
        this.options.onError(`Local voice recognition failed: ${detail}`);
      });
      this.recognizer = recognizer;
      this.options.onStateChange(true);
      this.options.onStatusChange('listening');
    } catch (error) {
      this.options.onStateChange(false);
      this.options.onStatusChange('error');
      this.options.onError(
        error instanceof Error ? error.message : 'Local voice recognition could not start.',
      );
    }
  }

  private handleTranscript(transcript: string, final: boolean): void {
    if (!this.enabled || this.destroyed) return;
    const phrase = normalizeVoicePhrase(transcript);
    if (!phrase || phrase === '[unk]') return;

    const commands = parseVoiceCommands(phrase);
    if (commands.length === 0) {
      if (final) {
        this.options.onTranscript(transcript);
        this.options.onUnrecognized?.(transcript);
      }
      return;
    }

    if (final) {
      this.clearPartialTimer();
      this.executeTranscript(phrase, commands);
      return;
    }

    if (this.pendingPartial === phrase && this.partialTimer !== null) return;
    this.clearPartialTimer();
    this.pendingPartial = phrase;
    const delay = isVoiceCommandPrefix(phrase)
      ? PREFIX_PARTIAL_SETTLE_MS
      : FAST_PARTIAL_SETTLE_MS;
    this.partialTimer = window.setTimeout(() => {
      this.partialTimer = null;
      const pending = this.pendingPartial;
      this.pendingPartial = '';
      const pendingCommands = parseVoiceCommands(pending);
      if (pendingCommands.length > 0) this.executeTranscript(pending, pendingCommands);
    }, delay);
  }

  private executeTranscript(phrase: string, commands: VoiceCommand[]): void {
    const now = performance.now();
    if (
      phrase === this.lastExecutedPhrase &&
      now - this.lastExecutedAt < DUPLICATE_COMMAND_WINDOW_MS
    ) return;

    this.lastExecutedPhrase = phrase;
    this.lastExecutedAt = now;
    this.options.onTranscript(phrase);

    if (this.dictating) {
      const stopCommand = commands.find((command) => command.type === 'stopDictation');
      if (stopCommand) {
        this.setDictationMode(false);
        this.options.onCommand(stopCommand, phrase);
      } else {
        // The local engine intentionally recognizes commands, not arbitrary
        // prose. Wispr remains the sole free-form dictation path for Rename.
        this.options.onDictation(phrase);
      }
      return;
    }

    for (const command of commands) this.options.onCommand(command, phrase);
  }

  private removeRecognizer(): void {
    this.recognizer?.remove();
    this.recognizer = null;
  }

  private clearPartialTimer(): void {
    if (this.partialTimer !== null) window.clearTimeout(this.partialTimer);
    this.partialTimer = null;
    this.pendingPartial = '';
  }
}
