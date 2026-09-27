export interface SpeechControllerOptions {
  language?: string;
  onTranscript(transcript: string): void;
  onStateChange?(listening: boolean): void;
  onError?(message: string): void;
}

export interface SpeechRecognitionEventLike extends Event {
  resultIndex?: number;
  results: {
    [index: number]: {
      [index: number]: { transcript: string; confidence?: number };
      length?: number;
      isFinal: boolean;
    };
    length: number;
  };
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onaudiostart?: (() => void) | null;
  onaudioend?: (() => void) | null;
  onspeechstart?: (() => void) | null;
  onspeechend?: (() => void) | null;
  onnomatch?: (() => void) | null;
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export class SpeechController {
  private recognition: SpeechRecognitionLike | null = null;

  constructor(private readonly options: SpeechControllerOptions) {}

  isSupported(): boolean {
    return Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition);
  }

  start(): boolean {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      this.options.onError?.('Speech recognition is not supported in this browser.');
      return false;
    }

    this.stop();
    const recognition = new Recognition();
    recognition.lang = this.options.language ?? 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim();
      if (transcript) this.options.onTranscript(transcript);
    };
    recognition.onerror = (event) => {
      this.options.onError?.(
        event.message || `Speech recognition failed: ${event.error}`,
      );
    };
    recognition.onend = () => {
      this.options.onStateChange?.(false);
      this.recognition = null;
    };

    try {
      recognition.start();
      this.recognition = recognition;
      this.options.onStateChange?.(true);
      return true;
    } catch (error) {
      this.options.onError?.(
        error instanceof Error ? error.message : 'Speech recognition could not start.',
      );
      return false;
    }
  }

  stop(): void {
    if (!this.recognition) return;
    this.recognition.stop();
    this.recognition = null;
    this.options.onStateChange?.(false);
  }

  destroy(): void {
    this.recognition?.abort();
    this.recognition = null;
  }
}
