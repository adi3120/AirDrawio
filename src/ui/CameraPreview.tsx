import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type RefObject,
} from 'react';
import type { NormalizedLandmark } from '../tracking/handTypes';

const CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

export interface CameraPreviewHandle {
  draw(landmarks: NormalizedLandmark[] | null, pinchRatio: number | null): void;
}

interface CameraPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  visible: boolean;
}

export const CameraPreview = forwardRef<CameraPreviewHandle, CameraPreviewProps>(
  function CameraPreview({ videoRef, visible }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useImperativeHandle(ref, () => ({
      draw(landmarks, pinchRatio) {
        const canvas = canvasRef.current;
        if (!canvas || !visible) return;
        const context = canvas.getContext('2d');
        if (!context) return;
        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const renderWidth = Math.round(width * pixelRatio);
        const renderHeight = Math.round(height * pixelRatio);
        if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
          canvas.width = renderWidth;
          canvas.height = renderHeight;
        }
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.fillStyle = '#000000';
        context.fillRect(0, 0, width, height);
        if (!landmarks) return;

        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.lineWidth = 2.4;
        context.strokeStyle = '#5eead4';
        context.shadowColor = 'rgba(45, 212, 191, .9)';
        context.shadowBlur = 8;
        for (const [from, to] of CONNECTIONS) {
          const a = landmarks[from];
          const b = landmarks[to];
          if (!a || !b) continue;
          context.beginPath();
          context.moveTo((1 - a.x) * width, a.y * height);
          context.lineTo((1 - b.x) * width, b.y * height);
          context.stroke();
        }

        landmarks.forEach((landmark, index) => {
          context.beginPath();
          const isControlTip = index === 4 || index === 8;
          context.fillStyle = isControlTip ? '#f9a8d4' : '#ecfeff';
          context.shadowColor = isControlTip
            ? 'rgba(249, 168, 212, .95)'
            : 'rgba(94, 234, 212, .9)';
          context.shadowBlur = isControlTip ? 13 : 7;
          context.arc(
            (1 - landmark.x) * width,
            landmark.y * height,
            isControlTip ? 5 : 2.7,
            0,
            Math.PI * 2,
          );
          context.fill();
        });
        context.shadowBlur = 0;
      },
    }), [visible]);

    return (
      <div className={`camera-preview ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}>
        <video ref={videoRef} muted playsInline className="camera-preview__video" />
        <canvas ref={canvasRef} className="camera-preview__landmarks" />
      </div>
    );
  },
);
