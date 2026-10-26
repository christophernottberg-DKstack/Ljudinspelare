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
  BookmarkPlus,
  ChevronLeft,
  ChevronRight,
  Flag,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react';
import { formatTime, formatPreciseTime } from '../utils/audioEncoder';

export interface WaveformMarker {
  id: string;
  time: number;
  label: string;
  color: string;
}

interface AudioPlayerProps {
  audioBuffer: AudioBuffer;
  onTrimChange?: (range: { startSec: number; endSec: number }) => void;
}

const MARKER_COLORS = [
  '#38bdf8', // sky-400
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#a855f7', // purple-500
  '#fb7185', // rose-400
  '#06b6d4', // cyan-500
];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  audioBuffer,
  onTrimChange,
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [volume, setVolume] = useState<number>(1);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(false);

  // Markers state
  const [markers, setMarkers] = useState<WaveformMarker[]>([]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState<string>('');

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

  const skipTime = (deltaSec: number) => {
    seekTo(currentTime + deltaSec);
  };

  // Add marker at specified time or current playback time
  const addMarker = (atTime?: number) => {
    const targetTime = atTime !== undefined ? atTime : currentTime;
    const clampedTime = Math.max(0, Math.min(targetTime, duration));

    // Choose color from palette
    const color = MARKER_COLORS[markers.length % MARKER_COLORS.length];
    const markerCount = markers.length + 1;

    const newMarker: WaveformMarker = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      time: clampedTime,
      label: `Markör ${markerCount}`,
      color,
    };

    const updated = [...markers, newMarker].sort((a, b) => a.time - b.time);
    setMarkers(updated);
    setActiveMarkerId(newMarker.id);
  };

  // Jump to previous marker
  const jumpToPreviousMarker = () => {
    if (markers.length === 0) return;
    const sorted = [...markers].sort((a, b) => a.time - b.time);
    // Find closest marker before current time (with 0.3s tolerance)
    const prev = [...sorted].reverse().find((m) => m.time < currentTime - 0.3);
    if (prev) {
      seekTo(prev.time);
      setActiveMarkerId(prev.id);
    } else {
      // Jump to very first marker or start
      seekTo(sorted[0].time);
      setActiveMarkerId(sorted[0].id);
    }
  };

  // Jump to next marker
  const jumpToNextMarker = () => {
    if (markers.length === 0) return;
    const sorted = [...markers].sort((a, b) => a.time - b.time);
    const next = sorted.find((m) => m.time > currentTime + 0.3);
    if (next) {
      seekTo(next.time);
      setActiveMarkerId(next.id);
    } else {
      // Jump to last marker
      seekTo(sorted[sorted.length - 1].time);
      setActiveMarkerId(sorted[sorted.length - 1].id);
    }
  };

  const removeMarker = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setMarkers((prev) => prev.filter((m) => m.id !== id));
    if (activeMarkerId === id) {
      setActiveMarkerId(null);
    }
  };

  const startRenameMarker = (marker: WaveformMarker, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingMarkerId(marker.id);
    setEditingLabel(marker.label);
  };

  const saveRenameMarker = (id: string) => {
    if (editingLabel.trim()) {
      setMarkers((prev) =>
        prev.map((m) => (m.id === id ? { ...m, label: editingLabel.trim() } : m))
      );
    }
    setEditingMarkerId(null);
  };

  // Keyboard shortcut listener within AudioPlayer
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'm' || e.key === 'M') {
        e.preventDefault();
        addMarker();
      } else if (e.key === '[') {
        e.preventDefault();
        jumpToPreviousMarker();
      } else if (e.key === ']') {
        e.preventDefault();
        jumpToNextMarker();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [currentTime, duration, markers]);

  // Draw full static waveform with real-time ruler and markers
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

    // Dynamic ruler interval calculation based on duration
    let majorInterval = 10;
    let minorInterval = 2;
    if (duration <= 10) {
      majorInterval = 2;
      minorInterval = 1;
    } else if (duration <= 30) {
      majorInterval = 5;
      minorInterval = 1;
    } else if (duration <= 60) {
      majorInterval = 10;
      minorInterval = 2;
    } else if (duration <= 180) {
      majorInterval = 30;
      minorInterval = 5;
    } else if (duration <= 600) {
      majorInterval = 60;
      minorInterval = 10;
    } else {
      majorInterval = 120;
      minorInterval = 30;
    }

    // Top Ruler Area (Height: 18px)
    const rulerHeight = 18;
    const waveTop = rulerHeight;
    const waveHeight = height - rulerHeight;

    // Draw Ruler background line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight);
    ctx.lineTo(width, rulerHeight);
    ctx.stroke();

    // Draw Time Ticks & Labels along ruler
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const totalSeconds = Math.ceil(duration);
    for (let s = 0; s <= totalSeconds; s += minorInterval) {
      const x = (s / duration) * width;
      const isMajor = s % majorInterval === 0;

      ctx.beginPath();
      ctx.strokeStyle = isMajor ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = isMajor ? 1.5 : 1;
      ctx.moveTo(x, isMajor ? 4 : 8);
      ctx.lineTo(x, rulerHeight);
      ctx.stroke();

      if (isMajor && x < width - 15) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
        ctx.fillText(formatTime(s), x, 7);
      }
    }

    // Extract peaks for waveform
    const channelData = audioBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / width);
    const amp = waveHeight / 2;

    // Background base waveform (unplayed)
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
      const y = waveTop + (waveHeight - barHeight) / 2;
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
      const y = waveTop + (waveHeight - barHeight) / 2;
      ctx.fillRect(i, y, 1.2, barHeight);
    }

    // Draw Custom User Markers directly on Waveform
    markers.forEach((m, idx) => {
      const mx = (m.time / duration) * width;

      // Marker line
      ctx.save();
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(mx, rulerHeight);
      ctx.lineTo(mx, height);
      ctx.stroke();
      ctx.restore();

      // Top flag icon / marker head
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.arc(mx, rulerHeight, 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Marker number flag tab
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      ctx.fillStyle = m.color;
      ctx.textAlign = 'center';
      ctx.fillText(`${idx + 1}`, mx, rulerHeight - 7);
    });

    // Draw Trim Boundary Markers if active
    if (isTrimActive) {
      const startX = (trimStart / duration) * width;
      const endX = (trimEnd / duration) * width;

      // Start Trim Marker
      ctx.save();
      ctx.strokeStyle = '#10b981'; // emerald-500
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, 0);
      ctx.lineTo(startX, height);
      ctx.stroke();
      ctx.restore();

      // End Trim Marker
      ctx.save();
      ctx.strokeStyle = '#f43f5e'; // rose-500
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(endX, 0);
      ctx.lineTo(endX, height);
      ctx.stroke();
      ctx.restore();
    }
  }, [audioBuffer, currentTime, duration, markers, isTrimActive, trimStart, trimEnd]);

  // Handle clicking on waveform to seek or double-click to add marker
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(ratio * duration);
  };

  const handleWaveformDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    addMarker(ratio * duration);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, mouseX / rect.width));
    setHoverTime(ratio * duration);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
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
      {/* Waveform container with real-time ruler, markers, playhead & hover indicator */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-300">Ljudspår</span>
            <span className="text-slate-500">·</span>
            <span className="text-[11px] text-slate-400">
              Klicka för att navigera · Dubbelklicka för markör
            </span>
          </div>

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
          onDoubleClick={handleWaveformDoubleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="relative w-full h-32 bg-slate-950 rounded-xl border border-slate-800 cursor-pointer overflow-hidden group select-none transition-colors hover:border-slate-700"
        >
          {/* Canvas Waveform & Ruler & Markers */}
          <canvas
            ref={canvasRef}
            className="w-full h-full block"
            style={{ width: '100%', height: '100%' }}
          />

          {/* Real-time Hover Line & Timestamp Marker */}
          {hoverTime !== null && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none transition-opacity duration-75 z-20 flex flex-col items-center"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            >
              <div className="w-[1px] h-full bg-slate-400/80 border-r border-dashed border-white/40" />
              <div className="absolute top-1 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-800/95 border border-slate-600 text-[10px] font-mono tabular-nums text-white shadow-md whitespace-nowrap">
                {formatPreciseTime(hoverTime)}
              </div>
            </div>
          )}

          {/* Interactive Marker Pins overlay (clickable) */}
          {markers.map((m, index) => {
            const leftPct = (m.time / duration) * 100;
            const isActive = activeMarkerId === m.id;
            return (
              <div
                key={m.id}
                onClick={(e) => {
                  e.stopPropagation();
                  seekTo(m.time);
                  setActiveMarkerId(m.id);
                }}
                className="absolute top-0 bottom-0 -ml-2.5 w-5 z-30 group/pin cursor-pointer flex flex-col items-center"
                style={{ left: `${leftPct}%` }}
                title={`${m.label} (${formatPreciseTime(m.time)}) - Klicka för att hoppa hit`}
              >
                {/* Pin head flag badge */}
                <div
                  className={`mt-0.5 px-1 py-0.5 rounded text-[9px] font-mono font-bold transition-transform shadow-md group-hover/pin:scale-110 ${
                    isActive ? 'scale-110 ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: m.color, color: '#0f172a' }}
                >
                  M{index + 1}
                </div>
              </div>
            );
          })}

          {/* Trim dimmed regions & Boundary Marker Tags */}
          {isTrimActive && (
            <>
              {/* Left dimmed region */}
              <div
                className="absolute top-0 bottom-0 left-0 bg-black/65 pointer-events-none z-10"
                style={{ width: `${(trimStart / duration) * 100}%` }}
              />
              {/* Start Trim Badge */}
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: `${(trimStart / duration) * 100}%` }}
              >
                <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-emerald-500/90 text-[9px] font-mono font-bold text-slate-950 uppercase shadow">
                  Start: {formatPreciseTime(trimStart)}
                </div>
              </div>

              {/* Right dimmed region */}
              <div
                className="absolute top-0 bottom-0 right-0 bg-black/65 pointer-events-none z-10"
                style={{ width: `${100 - (trimEnd / duration) * 100}%` }}
              />
              {/* End Trim Badge */}
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{ left: `${(trimEnd / duration) * 100}%` }}
              >
                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-rose-500/90 text-[9px] font-mono font-bold text-white uppercase shadow">
                  Slut: {formatPreciseTime(trimEnd)}
                </div>
              </div>
            </>
          )}

          {/* Real-time Playhead Indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-rose-400 pointer-events-none z-30 shadow-[0_0_10px_rgba(244,63,94,0.9)]"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          >
            <div className="w-3 h-3 -ml-1.25 mt-3 rounded-full bg-rose-500 shadow border-2 border-white ring-2 ring-rose-500/50" />
            <div className="absolute top-1 -translate-x-1/2 px-1 py-0.2 rounded bg-rose-600 text-[9px] font-mono tabular-nums text-white font-bold shadow pointer-events-none">
              {formatTime(currentTime)}
            </div>
          </div>
        </div>
      </div>

      {/* Marker Bar & Navigation Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 text-xs">
        {/* Add Marker & Jump Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => addMarker()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-medium transition-colors"
            title="Skapa en tidsmarkör vid nuvarande position (Tangent: M)"
          >
            <BookmarkPlus className="w-3.5 h-3.5 text-rose-400" />
            <span>+ Markör (M)</span>
          </button>

          {markers.length > 0 && (
            <div className="flex items-center gap-1 pl-1 border-l border-slate-800">
              <button
                onClick={jumpToPreviousMarker}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Hoppa till föregående markör ([)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-mono text-[11px] text-slate-400">
                {markers.length} {markers.length === 1 ? 'markör' : 'markörer'}
              </span>
              <button
                onClick={jumpToNextMarker}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
                title="Hoppa till nästa markör (])"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Marker list pills (quick jump) */}
        {markers.length > 0 ? (
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full py-0.5 no-scrollbar">
            {markers.map((m, idx) => (
              <div
                key={m.id}
                onClick={() => {
                  seekTo(m.time);
                  setActiveMarkerId(m.id);
                }}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer transition-colors border text-[11px] whitespace-nowrap ${
                  activeMarkerId === m.id
                    ? 'bg-slate-800 border-slate-600 text-white shadow-sm'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: m.color }}
                />
                {editingMarkerId === m.id ? (
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={(e) => setEditingLabel(e.target.value)}
                    onBlur={() => saveRenameMarker(m.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRenameMarker(m.id);
                    }}
                    autoFocus
                    className="w-16 px-1 py-0 bg-slate-950 border border-slate-700 text-white text-[11px] rounded outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span
                    onDoubleClick={(e) => startRenameMarker(m, e)}
                    className="truncate max-w-[80px]"
                    title="Dubbelklicka för att döpa om"
                  >
                    {m.label || `M${idx + 1}`}
                  </span>
                )}
                <span className="font-mono text-[10px] text-slate-400">
                  {formatTime(m.time)}
                </span>
                <button
                  onClick={(e) => removeMarker(m.id, e)}
                  className="p-0.5 text-slate-400 hover:text-rose-400 transition-colors"
                  title="Ta bort markör"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            Inga markörer ännu. Tryck &quot;+ Markör&quot; för att bokmärka viktiga avsnitt.
          </span>
        )}
      </div>

      {/* Trim adjustment controls (collapsible) */}
      {isTrimActive && (
        <div className="p-3.5 bg-slate-950/70 rounded-xl border border-rose-500/30 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-rose-400 font-medium flex items-center gap-1.5">
              <Scissors className="w-3.5 h-3.5" />
              <span>Redigering & Beskärning</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="text-slate-400 font-mono tabular-nums">
                Trimmat: {formatPreciseTime(trimStart)} – {formatPreciseTime(trimEnd)} (
                {formatPreciseTime(trimEnd - trimStart)})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="flex items-center gap-1 text-emerald-400">
                  <Flag className="w-3 h-3" />
                  Startpunkt
                </span>
                <span className="font-mono text-slate-200">{formatPreciseTime(trimStart)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={duration}
                step={0.05}
                value={trimStart}
                onChange={(e) => handleStartTrimChange(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <button
                  onClick={() => handleStartTrimChange(currentTime)}
                  className="hover:text-emerald-400 transition-colors"
                >
                  Sätt start vid nuvarande tid ({formatTime(currentTime)})
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <span className="flex items-center gap-1 text-rose-400">
                  <Flag className="w-3 h-3" />
                  Slutpunkt
                </span>
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
              <div className="flex justify-between text-[10px] text-slate-400">
                <button
                  onClick={() => handleEndTrimChange(currentTime)}
                  className="hover:text-rose-400 transition-colors"
                >
                  Sätt slut vid nuvarande tid ({formatTime(currentTime)})
                </button>
              </div>
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
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-current" />
            ) : (
              <Play className="w-5 h-5 fill-current ml-0.5" />
            )}
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
            <span>Redigera</span>
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
