import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Scissors,
  Check,
  RotateCw,
} from 'lucide-react';
import { formatTime, formatPreciseTime } from '../utils/audioEncoder';

interface AudioPlayerProps {
  audioBuffer: AudioBuffer;
  onTrimChange?: (range: { startSec: number; endSec: number }) => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioBuffer,
  onTrimChange,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  // Trim tool state
  const [isTrimActive, setIsTrimActive] = useState<boolean>(false);
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(audioBuffer.duration);

  // Audio nodes refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const startOffsetRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const duration = audioBuffer.duration;

  // Initialize trim range on duration change
  useEffect(() => {
    setTrimStart(0);
    setTrimEnd(duration);
    if (onTrimChange) {
      onTrimChange({ startSec: 0, endSec: duration });
    }
  }, [duration, onTrimChange]);

  // Setup playback AudioContext
  useEffect(() => {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    audioContextRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = volume;
    gain.connect(ctx.destination);
    gainNodeRef.current = gain;

    return () => {
      if (sourceNodeRef.current) {
        try {
          sourceNodeRef.current.stop();
        } catch {}
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      ctx.close().catch(() => {});
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [volume]);

  // Stop playback cleanly
  const stopAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
      } catch {}
      sourceNodeRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setIsPlaying(false);
  }, []);

  // Play audio from specific offset
  const playAudio = useCallback(
    (offsetSec: number) => {
      const ctx = audioContextRef.current;
      if (!ctx || !gainNodeRef.current) return;

      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      stopAudio();

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.playbackRate.value = playbackRate;
      source.connect(gainNodeRef.current);

      const effectiveStart = isTrimActive ? Math.max(offsetSec, trimStart) : offsetSec;
      const effectiveEnd = isTrimActive ? trimEnd : duration;
      const playDuration = Math.max(0, effectiveEnd - effectiveStart);

      startOffsetRef.current = effectiveStart;
      startTimeRef.current = ctx.currentTime;

      source.onended = () => {
        if (isLooping) {
          playAudio(isTrimActive ? trimStart : 0);
        } else {
          stopAudio();
          setCurrentTime(effectiveEnd >= duration ? 0 : effectiveEnd);
        }
      };

      source.start(0, effectiveStart, playDuration > 0 ? playDuration : undefined);
      sourceNodeRef.current = source;
      setIsPlaying(true);

      const updateProgress = () => {
        if (!sourceNodeRef.current) return;
        const elapsed = (ctx.currentTime - startTimeRef.current) * playbackRate;
        const current = startOffsetRef.current + elapsed;

        if (current >= effectiveEnd) {
          if (isLooping) {
            playAudio(isTrimActive ? trimStart : 0);
          } else {
            stopAudio();
            setCurrentTime(effectiveEnd >= duration ? 0 : effectiveEnd);
          }
          return;
        }

        setCurrentTime(current);
        rafRef.current = requestAnimationFrame(updateProgress);
      };

      rafRef.current = requestAnimationFrame(updateProgress);
    },
    [audioBuffer, playbackRate, isTrimActive, trimStart, trimEnd, duration, isLooping, stopAudio]
  );

  const togglePlay = () => {
    if (isPlaying) {
      stopAudio();
    } else {
      const minStart = isTrimActive ? trimStart : 0;
      const maxEnd = isTrimActive ? trimEnd : duration;
      let target = currentTime;
      if (target >= maxEnd || target < minStart) {
        target = minStart;
      }
      playAudio(target);
    }
  };

  const seekTo = (sec: number) => {
    const clamped = Math.max(0, Math.min(sec, duration));
    setCurrentTime(clamped);
    if (isPlaying) {
      playAudio(clamped);
    }
  };

  // Skip 5 seconds
  const skipTime = (deltaSec: number) => {
    seekTo(currentTime + deltaSec);
  };

  // Draw full static waveform
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

    ctx.clearRect(0, 0, width, height);

    // Extract peaks
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / width);
    const amp = height / 2;

    // Background base waveform
    ctx.fillStyle = '#334155'; // slate-700
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const sampleOffset = i * step;

      for (let j = 0; j < step && sampleOffset + j < channelData.length; j++) {
        const datum = channelData[sampleOffset + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const barHeight = Math.max(2, (max - min) * amp * 0.9);
      const y = (height - barHeight) / 2;
      ctx.fillRect(i, y, 1.2, barHeight);
    }

    // Active played portion waveform overlay
    const progressX = (currentTime / duration) * width;
    ctx.fillStyle = '#f43f5e'; // rose-500
    for (let i = 0; i < progressX; i++) {
      let min = 1.0;
      let max = -1.0;
      const sampleOffset = i * step;

      for (let j = 0; j < step && sampleOffset + j < channelData.length; j++) {
        const datum = channelData[sampleOffset + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const barHeight = Math.max(2, (max - min) * amp * 0.9);
      const y = (height - barHeight) / 2;
      ctx.fillRect(i, y, 1.2, barHeight);
    }
  }, [audioBuffer, currentTime, duration]);

  // Handle clicking on waveform to seek
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(ratio * duration);
  };

  // Apply trim update
  const handleStartTrimChange = (val: number) => {
    const cleanVal = Math.min(val, trimEnd - 0.2);
    setTrimStart(cleanVal);
    onTrimChange?.({ startSec: cleanVal, endSec: trimEnd });
  };

  const handleEndTrimChange = (val: number) => {
    const cleanVal = Math.max(val, trimStart + 0.2);
    setTrimEnd(cleanVal);
    onTrimChange?.({ startSec: trimStart, endSec: cleanVal });
  };

  const toggleTrim = () => {
    const next = !isTrimActive;
    setIsTrimActive(next);
    if (!next) {
      setTrimStart(0);
      setTrimEnd(duration);
      onTrimChange?.({ startSec: 0, endSec: duration });
    } else {
      onTrimChange?.({ startSec: trimStart, endSec: trimEnd });
    }
  };

  const speeds = [0.8, 1.0, 1.25, 1.5, 2.0];

  return (
    <div className="w-full flex flex-col gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
      {/* Waveform container with playhead & trim regions */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-medium text-slate-300">Ljudspår</span>
          <div className="flex items-center gap-2">
            <span className="font-mono tabular-nums text-slate-200 font-semibold">
              {formatTime(currentTime)}
            </span>
            <span className="text-slate-600">/</span>
            <span className="font-mono tabular-nums text-slate-400">
              {formatTime(duration)}
            </span>
          </div>
        </div>

        <div
          ref={containerRef}
          onClick={handleWaveformClick}
          className="relative w-full h-24 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer overflow-hidden group select-none transition-colors hover:border-slate-700"
        >
          {/* Canvas Waveform */}
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ width: '100%', height: '100%' }}
          />

          {/* Trim dimmed regions */}
          {isTrimActive && (
            <>
              {/* Left dimmed region */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/60 pointer-events-none border-r border-rose-500/80"
                style={{ width: `${(trimStart / duration) * 100}%` }}
              />
              {/* Right dimmed region */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/60 pointer-events-none border-l border-rose-500/80"
                style={{ width: `${100 - (trimEnd / duration) * 100}%` }}
              />
            </>
          )}

          {/* Playhead indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-400 pointer-events-none shadow-[0_0_8px_rgba(244,63,94,0.8)]"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="w-2.5 h-2.5 -ml-1 rounded-full bg-rose-500 shadow border border-white" />
          </div>
        </div>
      </div>

      {/* Trim adjustment controls (collapsible) */}
      {isTrimActive && (
        <div className="p-3 bg-slate-950/70 rounded-xl border border-rose-500/30 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-400 font-medium flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" />
              Klipp / Beskär tidsintervall
            </span>
            <span className="text-slate-400 font-mono tabular-nums">
              Varaktighet: {formatPreciseTime(trimEnd - trimStart)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Startpunkt</span>
                <span className="font-mono text-slate-200">{formatPreciseTime(trimStart)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={trimStart}
                onChange={(e) => handleStartTrimChange(parseFloat(e.target.value))}
                className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-xs text-slate-400">
                <span>Slutpunkt</span>
                <span className="font-mono text-slate-200">{formatPreciseTime(trimEnd)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={trimEnd}
                onChange={(e) => handleEndTrimChange(parseFloat(e.target.value))}
                className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Main playback control bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Play / Skip Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => skipTime(-5)}
            title="Spola bakåt 5 sekunder"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-medium shadow-md shadow-rose-950/40 transition-transform active:scale-95"
            title={isPlaying ? 'Pausa' : 'Spela'}
          >
            {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => skipTime(5)}
            title="Spola framåt 5 sekunder"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Secondary controls: Volume & Speed & Trim */}
        <div className="flex items-center gap-3">
          {/* Speed selector */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-950 rounded-lg border border-slate-800">
            {speeds.map((s) => (
              <button
                key={s}
                onClick={() => setPlaybackRate(s)}
                className={`px-2 py-1 text-xs font-mono font-medium rounded-md transition-colors ${
                  playbackRate === s
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            title="Upprepa uppspelning"
            className={`p-2 rounded-lg text-xs font-medium transition-colors ${
              isLooping
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            Loop
          </button>

          {/* Trim toggle button */}
          <button
            onClick={toggleTrim}
            title={isTrimActive ? 'Stäng klippning' : 'Klipp i inspelningen'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isTrimActive
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {isTrimActive ? <Check className="w-3.5 h-3.5" /> : <Scissors className="w-3.5 h-3.5" />}
            <span>Klipp</span>
          </button>

          {/* Volume slider */}
          <div className="hidden sm:flex items-center gap-2 pl-2 border-l border-slate-800">
            <button
              onClick={() => setVolume(volume > 0 ? 0 : 1)}
              className="text-slate-400 hover:text-slate-200"
            >
              {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-16 accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
