import { useState, useRef, useEffect, useCallback } from 'react';

export type RecorderStatus = 'idle' | 'recording' | 'paused' | 'processing' | 'ready';

export interface AudioDevice {
  deviceId: string;
  label: string;
}

export interface AudioRecorderHook {
  status: RecorderStatus;
  recordingTime: number;
  audioBuffer: AudioBuffer | null;
  recordedBlob: Blob | null;
  analyserNode: AnalyserNode | null;
  audioLevel: number; // 0 to 1
  audioDb: number; // -Infinity to 0
  error: string | null;
  // Settings
  autoGain: boolean;
  noiseSuppression: boolean;
  manualGain: number; // 0.1 to 3.0 (default 1.0)
  selectedDeviceId: string;
  availableDevices: AudioDevice[];
  // Actions
  startRecording: () => Promise<void>;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => Promise<void>;
  resetRecording: () => void;
  loadAudioBuffer: (buffer: AudioBuffer, blob?: Blob) => void;
  setAutoGain: (enabled: boolean) => void;
  setNoiseSuppression: (enabled: boolean) => void;
  setManualGain: (gain: number) => void;
  setSelectedDeviceId: (deviceId: string) => void;
  clearError: () => void;
}

export function useAudioRecorder(): AudioRecorderHook {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [recordingTime, setRecordingTime] = useState<number>(0);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Audio settings
  const [autoGain, setAutoGainState] = useState<boolean>(true);
  const [noiseSuppression, setNoiseSuppressionState] = useState<boolean>(true);
  const [manualGain, setManualGainState] = useState<number>(1.0);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>('');
  const [availableDevices, setAvailableDevices] = useState<AudioDevice[]>([]);

  // Live metering
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [audioDb, setAudioDb] = useState<number>(-60);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);

  // Internal Web Audio refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const destNodeRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Timer ref
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const accumulatedTimeRef = useRef<number>(0);

  // Animation frame ref for audio level metering
  const meterRafRef = useRef<number | null>(null);

  // Enumerate input devices
  const updateDevices = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === 'audioinput')
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Mikrofon ${index + 1}`,
        }));
      setAvailableDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceIdState(audioInputs[0].deviceId);
      }
    } catch {
      // Permission not yet granted, labels might be empty
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    updateDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', updateDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', updateDevices);
    };
  }, [updateDevices]);

  // Clean up timer
  const stopTimer = () => {
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // Start metering loop
  const startMetering = (analyser: AnalyserNode) => {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const updateMeter = () => {
      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const norm = (dataArray[i] - 128) / 128;
        sumSquares += norm * norm;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const level = Math.min(1, rms * 3.5); // Scaled for visible feedback
      const db = rms > 0.0001 ? Math.max(-60, 20 * Math.log10(rms)) : -60;

      setAudioLevel(level);
      setAudioDb(db);

      meterRafRef.current = requestAnimationFrame(updateMeter);
    };
    meterRafRef.current = requestAnimationFrame(updateMeter);
  };

  const stopMetering = () => {
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    setAudioLevel(0);
    setAudioDb(-60);
  };

  // Stop tracks and release media
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    stopMetering();
    stopTimer();
    setAnalyserNode(null);
  }, []);

  useEffect(() => {
    return () => {
      cleanupStream();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close().catch(() => {});
      }
    };
  }, [cleanupStream]);

  // Start recording
  const startRecording = async () => {
    setError(null);
    try {
      cleanupStream();

      // Setup AudioContext
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Audio constraints respecting autoGain & noiseSuppression
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          autoGainControl: autoGain,
          noiseSuppression: noiseSuppression,
          echoCancellation: true,
          channelCount: 2,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Re-enumerate to get human labels now that permission is granted
      updateDevices();

      // Web Audio routing
      const source = ctx.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      // Gain Node (if autoGain is off or manual boost is desired)
      const gain = ctx.createGain();
      gain.gain.value = autoGain ? 1.0 : manualGain;
      gainNodeRef.current = gain;

      // Analyser Node for live visualizer
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);

      // Destination for recorder
      const dest = ctx.createMediaStreamDestination();
      destNodeRef.current = dest;

      source.connect(gain);
      gain.connect(analyser);
      gain.connect(dest);

      // Start metering
      startMetering(analyser);

      // Setup MediaRecorder
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        'audio/aac',
      ];
      let mimeType = '';
      for (const t of supportedTypes) {
        if (MediaRecorder.isTypeSupported(t)) {
          mimeType = t;
          break;
        }
      }

      const recorder = new MediaRecorder(dest.stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        setStatus('processing');
        try {
          const finalBlob = new Blob(chunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          });
          setRecordedBlob(finalBlob);

          // Decode into full AudioBuffer for precision editing and mp3 export
          const arrayBuffer = await finalBlob.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arrayBuffer);
          setAudioBuffer(decoded);
          setStatus('ready');
        } catch (err) {
          console.error('Audio decoding error:', err);
          setError('Kunde inte avkoda ljudinspelningen. Försök igen.');
          setStatus('idle');
        } finally {
          cleanupStream();
        }
      };

      recorder.start(100); // 100ms chunks

      accumulatedTimeRef.current = 0;
      startTimeRef.current = Date.now();
      setRecordingTime(0);

      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000 + accumulatedTimeRef.current;
        setRecordingTime(elapsed);
      }, 100);

      setStatus('recording');
    } catch (err: unknown) {
      console.error('Mic error:', err);
      const e = err as { name?: string; message?: string };
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        setError(
          'Åtkomst till mikrofonen nekades. Vänligen ge tillåtelse till mikrofonen i din webbläsare för att spela in.'
        );
      } else if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
        setError('Ingen mikrofon hittades på din enhet. Kontrollera din mikrofonanslutning.');
      } else {
        setError(`Kunde inte starta inspelningen: ${e.message || 'Okänt fel'}`);
      }
      cleanupStream();
      setStatus('idle');
    }
  };

  // Pause
  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.pause();
      accumulatedTimeRef.current += (Date.now() - startTimeRef.current) / 1000;
      stopTimer();
      stopMetering();
      setStatus('paused');
    }
  };

  // Resume
  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      mediaRecorderRef.current.resume();
      startTimeRef.current = Date.now();
      if (analyserRef.current) {
        startMetering(analyserRef.current);
      }
      timerIntervalRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000 + accumulatedTimeRef.current;
        setRecordingTime(elapsed);
      }, 100);
      setStatus('recording');
    }
  };

  // Stop
  const stopRecording = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      stopTimer();
      stopMetering();
      mediaRecorderRef.current.stop();
      // recorder.onstop will transition status to 'processing' then 'ready'
    }
  };

  // Reset
  const resetRecording = () => {
    cleanupStream();
    setAudioBuffer(null);
    setRecordedBlob(null);
    setRecordingTime(0);
    accumulatedTimeRef.current = 0;
    setStatus('idle');
    setError(null);
  };

  // Dynamic updates to gain node when active
  const setAutoGain = (enabled: boolean) => {
    setAutoGainState(enabled);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = enabled ? 1.0 : manualGain;
    }
  };

  const setManualGain = (gain: number) => {
    setManualGainState(gain);
    if (!autoGain && gainNodeRef.current) {
      gainNodeRef.current.gain.value = gain;
    }
  };

  const setNoiseSuppression = (enabled: boolean) => {
    setNoiseSuppressionState(enabled);
  };

  const setSelectedDeviceId = (deviceId: string) => {
    setSelectedDeviceIdState(deviceId);
  };

  const clearError = () => setError(null);

  const loadAudioBuffer = (buffer: AudioBuffer, blob?: Blob) => {
    cleanupStream();
    setAudioBuffer(buffer);
    if (blob) setRecordedBlob(blob);
    setRecordingTime(buffer.duration);
    setStatus('ready');
    setError(null);
  };

  return {
    status,
    recordingTime,
    audioBuffer,
    recordedBlob,
    analyserNode,
    audioLevel,
    audioDb,
    error,
    autoGain,
    noiseSuppression,
    manualGain,
    selectedDeviceId,
    availableDevices,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    loadAudioBuffer,
    setAutoGain,
    setNoiseSuppression,
    setManualGain,
    setSelectedDeviceId,
    clearError,
  };
}
