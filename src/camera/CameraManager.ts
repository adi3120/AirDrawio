import type { CameraState } from './cameraTypes';

export class CameraManager {
  private stream: MediaStream | null = null;
  private state: CameraState = { status: 'idle' };

  constructor(private readonly video: HTMLVideoElement) {}

  getState(): CameraState {
    return this.state;
  }

  async start(): Promise<CameraState> {
    if (this.stream) return this.state;
    this.state = { status: 'requesting' };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
      this.state = { status: 'active' };
    } catch (error) {
      const denied = error instanceof DOMException && error.name === 'NotAllowedError';
      this.state = {
        status: denied ? 'denied' : 'error',
        message: denied
          ? 'Camera access was denied. Allow camera access in your browser and try again.'
          : error instanceof Error
            ? error.message
            : 'The camera could not be started.',
      };
    }

    return this.state;
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.state = { status: 'idle' };
  }
}
