export class DoublePinchDetector {
  private lastCompletion: number | null = null;

  constructor(private intervalMs = 400) {}

  setInterval(intervalMs: number): void {
    this.intervalMs = intervalMs;
  }

  registerPinchStart(timestamp: number): boolean {
    if (
      this.lastCompletion !== null &&
      timestamp - this.lastCompletion <= this.intervalMs
    ) {
      this.lastCompletion = null;
      return true;
    }
    return false;
  }

  registerPinchEnd(timestamp: number): void {
    this.lastCompletion = timestamp;
  }

  reset(): void {
    this.lastCompletion = null;
  }
}
