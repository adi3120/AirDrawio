import { useEffect, useRef } from 'react';
import type { VoiceInputStatus } from '../voice/VoiceInputMonitor';

interface VoiceGraphVisualizerProps {
  analyser: AnalyserNode | null;
  status: VoiceInputStatus;
  recognitionListening: boolean;
  lastPhrase: string;
  deviceLabel: string;
  visible: boolean;
}

const STATUS_LABELS: Record<VoiceInputStatus, string> = {
  idle: 'Microphone off',
  requesting: 'Requesting microphone',
  active: 'Live microphone',
  suspended: 'Audio paused',
  denied: 'Microphone denied',
  error: 'Microphone error',
};

export function VoiceGraphVisualizer({
  analyser,
  status,
  recognitionListening,
  lastPhrase,
  deviceLabel,
  visible,
}: VoiceGraphVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const virtualInput = /virtual|webex|blackhole|loopback|soundflower/i.test(deviceLabel);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !visible) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let animation = 0;
    const timeData = analyser ? new Float32Array(analyser.fftSize) : null;
    const frequencyData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;
    let adaptiveGain = 6;
    let displayedLevel = 0;

    const draw = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);

      context.strokeStyle = 'rgba(122, 150, 162, .12)';
      context.lineWidth = 1;
      for (let column = 1; column < 6; column += 1) {
        const x = (width / 6) * column;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
      for (let row = 1; row < 4; row += 1) {
        const y = (height / 4) * row;
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      let level = 0;
      if (analyser && timeData && frequencyData) {
        // Float samples preserve quiet microphone input that an 8-bit waveform
        // rounds to a perfectly flat 128 line.
        analyser.getFloatTimeDomainData(timeData);
        analyser.getByteFrequencyData(frequencyData);

        let sum = 0;
        let peak = 0;
        for (const sample of timeData) {
          sum += sample * sample;
          peak = Math.max(peak, Math.abs(sample));
        }
        const rms = Math.sqrt(sum / timeData.length);
        const decibels = rms > 0 ? 20 * Math.log10(rms) : -100;
        const targetLevel = Math.max(0, Math.min(1, (decibels + 70) / 50));
        displayedLevel = displayedLevel * 0.82 + targetLevel * 0.18;
        level = displayedLevel;

        // Auto-range the waveform like an oscilloscope. Quiet voices become
        // visible, while louder sounds are smoothly prevented from clipping.
        const targetGain = Math.max(2, Math.min(45, 0.38 / Math.max(peak, 0.001)));
        adaptiveGain = adaptiveGain * 0.9 + targetGain * 0.1;

        const barCount = 24;
        const barWidth = width / barCount;
        for (let index = 0; index < barCount; index += 1) {
          const bin = Math.floor((index / barCount) * Math.min(frequencyData.length, 180));
          const strength = frequencyData[bin] / 255;
          const barHeight = Math.max(1, strength * height * 0.42);
          context.fillStyle = `rgba(167, 139, 250, ${0.08 + strength * 0.28})`;
          context.fillRect(index * barWidth + 1, height - barHeight, Math.max(1, barWidth - 2), barHeight);
        }

        const gradient = context.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#a78bfa');
        gradient.addColorStop(0.52, '#5eead4');
        gradient.addColorStop(1, '#f9a8d4');
        context.strokeStyle = gradient;
        context.lineWidth = 2;
        context.shadowColor = 'rgba(94, 234, 212, .45)';
        context.shadowBlur = 7;
        context.beginPath();
        for (let index = 0; index < timeData.length; index += 1) {
          const x = (index / (timeData.length - 1)) * width;
          const y = height / 2 + timeData[index] * adaptiveGain * height * 0.43;
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.stroke();
        context.shadowBlur = 0;
      } else {
        context.strokeStyle = 'rgba(126, 145, 157, .42)';
        context.setLineDash([4, 5]);
        context.beginPath();
        context.moveTo(0, height / 2);
        context.lineTo(width, height / 2);
        context.stroke();
        context.setLineDash([]);
      }

      context.fillStyle = 'rgba(7, 13, 18, .76)';
      context.fillRect(7, 7, 58, 17);
      context.fillStyle = status === 'active' ? '#8ff8e9' : '#81919c';
      context.font = '500 8px DM Mono, ui-monospace, monospace';
      context.fillText(`${Math.round(level * 100)}% LEVEL`, 12, 18);

      animation = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animation);
  }, [analyser, visible]);

  if (!visible) return null;
  return (
    <section className={`voice-graph voice-graph--${status} ${virtualInput ? 'voice-graph--virtual' : ''}`} aria-label="Live voice graph">
      <header>
        <span><i /> Voice graph</span>
        <strong>{virtualInput ? 'Virtual input' : STATUS_LABELS[status]}</strong>
      </header>
      <canvas ref={canvasRef} />
      <footer>
        <span className={`${recognitionListening ? 'is-listening' : ''} ${virtualInput ? 'has-warning' : ''}`}>
          {virtualInput ? 'Virtual microphone selected' : recognitionListening ? 'Recognizing commands' : 'Audio monitor only'}
        </span>
        <strong>{virtualInput ? deviceLabel : status === 'suspended' ? 'Select Retry microphone once' : lastPhrase ? `“${lastPhrase}”` : 'Speak to see your waveform'}</strong>
      </footer>
    </section>
  );
}
