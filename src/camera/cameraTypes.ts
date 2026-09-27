export type CameraStatus = 'idle' | 'requesting' | 'active' | 'denied' | 'error';

export interface CameraState {
  status: CameraStatus;
  message?: string;
}
