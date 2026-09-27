import type { DrawioBridge } from '../drawio/DrawioBridge';
import { SpeechController } from './SpeechController';

export interface VoiceTextOptions {
  onListeningChange(listening: boolean): void;
  onNotice(message: string): void;
}

export class VoiceTextController {
  private readonly speech: SpeechController;

  constructor(
    private readonly diagram: DrawioBridge,
    options: VoiceTextOptions,
  ) {
    this.speech = new SpeechController({
      onStateChange: options.onListeningChange,
      onError: options.onNotice,
      onTranscript: (transcript) => {
        if (this.diagram.setSelectedLabel(transcript)) {
          options.onNotice(`Label set to “${transcript}”.`);
        } else {
          options.onNotice('Select a shape before using voice input.');
        }
      },
    });
  }

  start(): boolean {
    if (!this.diagram.getSelectedLabel()) return false;
    return this.speech.start();
  }

  stop(): void {
    this.speech.stop();
  }

  destroy(): void {
    this.speech.destroy();
  }
}
