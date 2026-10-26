import React, { useEffect, useRef } from 'react';
import { Volume2, VolumeX, AlertCircle } from 'lucide-react';

interface LiveVisualizerProps {
  analyserNode: AnalyserNode | null;
  isRecording: boolean;
  isPaused: boolean;
  audioLevel: number; // 0 to 1
  audioDb: number; // -60 to 0
}

export const LiveVisualizer: React.FC<LiveVisualizerProps> = ({
  analyserNode,
  isRecording,
  isPaused,
  audioLevel,
  audioDb,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

    let bufferLength = 256;
    let dataArray = new Uint8Array(bufferLength);

    if (analyserNode) {
      bufferLength = analyserNode.frequencyBinCount;
      dataArray = new Uint8Array(bufferLength);
    }

    let phase = 0;

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      // Subtle background grid lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      const centerY = height / 2;

      // Center reference baseline
      ctx.beginPath();
      ctx.moveTo(0, centerY);
      ctx.lineTo(width, centerY);
      ctx.stroke();

      if (isRecording && analyserNode && !isPaused) {
        analyserNode.getByteTimeDomainData(dataArray);

        // Gradient for active recording waveform
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#f43f5e'); // rose-500
        gradient.addColorStop(0.5, '#fb7185'); // rose-400
        gradient.addColorStop(1, '#fda4af'); // rose-300

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = gradient;
        ctx.beginPath();

        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0; // 0.0 to 2.0
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(width, centerY);
        ctx.stroke();

        // Also draw soft glow shadow
        ctx.save();
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.15)';
        ctx.stroke();
        ctx.restore();
      } else if (isPaused) {
        // Paused state: subtle frozen / quiet flatline with dashed pulse
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        // Idle ambient gentle wave
        phase += 0.03;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const points = 120;
        for (let i = 0; i <= points; i++) {
          const x = (i / points) * width;
          const normalSin = Math.sin((i / points) * Math.PI * 4 + phase);
          const envelope = Math.sin((i / points) * Math.PI); // Taper edges
          const y = centerY + normalSin * 6 * envelope;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [analyserNode, isRecording, isPaused]);

  // Volume meter color calculation
  const getMeterColor = (val: number) => {
    if (val > 0.85) return 'bg-rose-500'; // Peak warning / clipping
    if (val > 0.6) return 'bg-amber-400';
    return 'bg-emerald-500';
  };

  const isClipping = audioLevel > 0.9;
  const isTooQuiet = isRecording && !isPaused && audioLevel < 0.05;

  return (
    <div className="w-full flex flex-col gap-3">
      {/* Waveform Canvas Container */}
      <div className="relative w-full h-28 bg-slate-900/90 rounded-xl border border-slate-800/80 overflow-hidden flex items-center justify-center shadow-inner">
        <canvas
          ref={canvasRef}
          className="w-full h-full block"
          style={{ width: '100%', height: '100%' }}
        />

        {/* Status badges inside canvas */}
        <div className="absolute top-2.5 right-3 flex items-center gap-2 pointer-events-none">
          {isRecording && !isPaused && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>SPELAR IN</span>
            </div>
          )}
          {isPaused && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>PAUSAD</span>
            </div>
          )}
          {!isRecording && (
            <span className="text-xs text-slate-500 font-medium">Redo att spela in</span>
          )}
        </div>

        {/* Centered micro-hint when idle */}
        {!isRecording && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-xs text-slate-500/80 tracking-wide font-normal">
              Mikrofonsignal visas här vid inspelning
            </span>
          </div>
        )}
      </div>

      {/* Real-time VU / Volume Meter */}
      <div className="flex items-center gap-3 px-1 text-xs text-slate-400">
        <div className="flex items-center gap-1.5 shrink-0">
          {audioLevel > 0.02 ? (
            <Volume2 className="w-4 h-4 text-slate-400" />
          ) : (
            <VolumeX className="w-4 h-4 text-slate-600" />
          )}
          <span className="font-medium text-slate-300">Volymnivå</span>
        </div>

        {/* Dynamic segmented meter track */}
        <div className="flex-1 h-2 bg-slate-800/80 rounded-full overflow-hidden flex items-center p-0.5 border border-slate-700/50">
          <div
            className={`h-full rounded-full transition-all duration-75 ${getMeterColor(audioLevel)}`}
            style={{ width: `${Math.min(100, Math.max(2, audioLevel * 100))}%` }}
          />
        </div>

        {/* Decibels readout */}
        <span className="font-mono tabular-nums text-slate-400 w-14 text-right">
          {audioDb > -58 ? `${audioDb.toFixed(0)} dB` : '-∞ dB'}
        </span>

        {/* Warning helpers */}
        {isClipping && (
          <div className="flex items-center gap-1 text-rose-400 text-xs animate-bounce shrink-0">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>För starkt</span>
          </div>
        )}
        {isTooQuiet && (
          <div className="text-slate-500 text-xs hidden sm:block shrink-0">
            Prata i mikrofonen...
          </div>
        )}
      </div>
    </div>
  );
};
