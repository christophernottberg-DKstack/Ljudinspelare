import { Mp3Encoder } from '@breezystack/lamejs';

/**
 * Converts Float32 audio samples (-1.0 to 1.0) into Int16 (-32768 to 32767).
 */
export function floatToInt16(floatSamples: Float32Array): Int16Array {
  const len = floatSamples.length;
  const int16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16;
}

export interface EncodeMp3Options {
  bitrate?: number; // kbps: 96, 128, 192, 256, 320
  startSec?: number;
  endSec?: number;
  onProgress?: (percent: number) => void;
}

/**
 * Encodes an AudioBuffer into an authentic MP3 Blob using LAME.
 */
export async function convertAudioBufferToMp3(
  audioBuffer: AudioBuffer,
  options: EncodeMp3Options = {}
): Promise<Blob> {
  const {
    bitrate = 192,
    startSec = 0,
    endSec = audioBuffer.duration,
    onProgress,
  } = options;

  const sampleRate = audioBuffer.sampleRate;
  const numberOfChannels = audioBuffer.numberOfChannels;

  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const endSample = Math.min(
    audioBuffer.length,
    Math.floor(endSec * sampleRate)
  );
  const totalSamplesToEncode = endSample - startSample;

  if (totalSamplesToEncode <= 0) {
    throw new Error('Inget giltigt ljudintervall att exportera');
  }

  // Create mono or stereo LAME encoder
  // Note: Most browser voice mic recordings are mono or stereo
  const channels = Math.min(2, numberOfChannels);
  const encoder = new Mp3Encoder(channels, sampleRate, bitrate);

  // Extract channel data slices
  const leftFloat = audioBuffer.getChannelData(0).subarray(startSample, endSample);
  const leftInt16 = floatToInt16(leftFloat);

  let rightInt16: Int16Array | null = null;
  if (channels === 2 && audioBuffer.numberOfChannels > 1) {
    const rightFloat = audioBuffer.getChannelData(1).subarray(startSample, endSample);
    rightInt16 = floatToInt16(rightFloat);
  }

  const mp3DataParts: BlobPart[] = [];
  const chunkSize = 1152; // LAME standard frame size

  let processedSamples = 0;

  for (let i = 0; i < totalSamplesToEncode; i += chunkSize) {
    const chunkEnd = Math.min(i + chunkSize, totalSamplesToEncode);
    const leftChunk = leftInt16.subarray(i, chunkEnd);

    let mp3buf: Int8Array | Uint8Array;
    if (channels === 1 || !rightInt16) {
      mp3buf = encoder.encodeBuffer(leftChunk);
    } else {
      const rightChunk = rightInt16.subarray(i, chunkEnd);
      mp3buf = encoder.encodeBuffer(leftChunk, rightChunk);
    }

    if (mp3buf.length > 0) {
      // Copy to clean ArrayBuffer to ensure compatibility
      const copy = new Uint8Array(mp3buf.length);
      copy.set(mp3buf);
      mp3DataParts.push(copy.buffer);
    }

    processedSamples += (chunkEnd - i);
    if (onProgress) {
      onProgress(Math.min(99, Math.round((processedSamples / totalSamplesToEncode) * 100)));
    }

    // Yield control periodically if buffer is long to prevent blocking UI
    if (i % (chunkSize * 20) === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const flushBuf = encoder.flush();
  if (flushBuf.length > 0) {
    const copy = new Uint8Array(flushBuf.length);
    copy.set(flushBuf);
    mp3DataParts.push(copy.buffer);
  }

  if (onProgress) {
    onProgress(100);
  }

  return new Blob(mp3DataParts, { type: 'audio/mp3' });
}

/**
 * Format seconds into mm:ss or hh:mm:ss with padded zeros.
 */
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00';
  const totalSec = Math.floor(seconds);
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;

  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs
    .toString()
    .padStart(2, '0')}`;
}

/**
 * Format milliseconds into m:ss.s for precise trim editing
 */
export function formatPreciseTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00.0';
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins.toString().padStart(2, '0')}:${secs.padStart(4, '0')}`;
}

/**
 * Format byte count to human-readable size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Sanitizes and formats the filename to end with .mp3
 */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return 'inspelning.mp3';
  }
  // Replace disallowed characters
  const clean = trimmed.replace(/[\\/:*?"<>|]/g, '_');
  if (clean.toLowerCase().endsWith('.mp3')) {
    return clean;
  }
  return `${clean}.mp3`;
}

/**
 * Triggers a browser download to the user's Downloads directory ("Hämtade filer")
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const cleanName = sanitizeFilename(filename);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = cleanName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
}

export interface NormalizationResult {
  normalizedBuffer: AudioBuffer;
  originalPeak: number;
  originalPeakDb: number;
  targetPeak: number;
  gainFactor: number;
  gainDb: number;
  wasBoosted: boolean;
}

/**
 * Scans an AudioBuffer for maximum absolute peak amplitude across all channels.
 */
export function getAudioBufferPeak(buffer: AudioBuffer): number {
  let maxPeak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > maxPeak) {
        maxPeak = abs;
      }
    }
  }
  return maxPeak;
}

/**
 * Normalizes an AudioBuffer to an optimal target peak without clipping.
 * Default targetPeak is 0.95 (approx -0.45 dBFS) to preserve headroom for MP3 encoding.
 */
export function normalizeAudioBuffer(
  buffer: AudioBuffer,
  targetPeak = 0.95
): NormalizationResult {
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();

  const originalPeak = getAudioBufferPeak(buffer);
  const originalPeakDb = originalPeak > 0.0001 ? 20 * Math.log10(originalPeak) : -60;

  // If buffer is virtually silent or already at or above target, no boost needed
  if (originalPeak < 0.0001 || originalPeak >= targetPeak) {
    return {
      normalizedBuffer: buffer,
      originalPeak,
      originalPeakDb,
      targetPeak,
      gainFactor: 1.0,
      gainDb: 0,
      wasBoosted: false,
    };
  }

  const gainFactor = targetPeak / originalPeak;
  const gainDb = 20 * Math.log10(gainFactor);

  // Create a new AudioBuffer with normalized sample data
  const normalizedBuffer = ctx.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  );

  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c);
    const dst = normalizedBuffer.getChannelData(c);
    for (let i = 0; i < src.length; i++) {
      // Multiply by gainFactor and clamp safely between -1.0 and 1.0 to prevent distortion
      const val = src[i] * gainFactor;
      dst[i] = Math.max(-1.0, Math.min(1.0, val));
    }
  }

  return {
    normalizedBuffer,
    originalPeak,
    originalPeakDb,
    targetPeak,
    gainFactor,
    gainDb,
    wasBoosted: true,
  };
}
