import React, { useEffect, useRef } from 'react';
import type { ThreatLevel } from '../types';
import { Activity } from 'lucide-react';

interface AudioOscilloscopeProps {
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
  threatLevel: ThreatLevel;
  audioSourceLabel: string;
}

export const AudioOscilloscope: React.FC<AudioOscilloscopeProps> = ({
  analyserNode,
  isPlaying,
  threatLevel,
  audioSourceLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyserNode ? analyserNode.frequencyBinCount : 128;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);

      const width = canvas.width;
      const height = canvas.height;

      // Clean, crisp background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Subtle light grid lines
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += 25) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // Center baseline
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Wave color based on threat status
      let strokeColor = '#2563eb'; // Primary Blue
      if (threatLevel === 'RED') {
        strokeColor = '#dc2626'; // Danger Red
      } else if (threatLevel === 'AMBER') {
        strokeColor = '#d97706'; // Warning Amber
      }

      ctx.lineWidth = 2;
      ctx.strokeStyle = strokeColor;
      ctx.beginPath();

      if (analyserNode && isPlaying) {
        analyserNode.getByteTimeDomainData(dataArray);
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }
      } else {
        // Idle gentle wave animation
        const time = Date.now() * 0.002;
        for (let x = 0; x < width; x += 2) {
          const y = height / 2 + Math.sin(x * 0.03 + time) * (isPlaying ? 14 : 3);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyserNode, isPlaying, threatLevel]);

  return (
    <div
      className="clean-card"
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={18} color="var(--color-primary)" />
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Audio Signal Oscilloscope
            </h2>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isPlaying && (
            <span
              style={{
                display: 'inline-block',
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                background: 'var(--color-primary)',
                animation: 'status-pulse 1.5s infinite',
              }}
            />
          )}
          <span
            style={{
              fontSize: '11px',
              fontWeight: 500,
              color: isPlaying ? 'var(--color-primary-text)' : 'var(--text-secondary)',
              padding: '3px 10px',
              borderRadius: 'var(--radius-full)',
              background: isPlaying ? 'var(--color-primary-light)' : 'var(--bg-card-subtle)',
              border: `1px solid ${isPlaying ? 'var(--color-primary-border)' : 'var(--border-subtle)'}`,
            }}
          >
            {audioSourceLabel}
          </span>
        </div>
      </div>

      <div
        style={{
          width: '100%',
          height: '135px',
          borderRadius: 'var(--radius-sm)',
          overflow: 'hidden',
          background: '#ffffff',
          border: '1px solid var(--border-subtle)',
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          width={700}
          height={135}
          style={{ width: '100%', height: '100%', display: 'block' }}
        />
      </div>
    </div>
  );
};
