import { useState, useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Mic,
  Square,
  Pause,
  Play,
  RotateCcw,
  Download,
  Settings2,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Keyboard,
  Info,
  X,
  History,
  Archive,
  Volume2,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import {
  convertAudioBufferToMp3,
  formatTime,
  sanitizeFilename,
  triggerDownload,
  normalizeAudioBuffer,
  NormalizationResult,
} from './utils/audioEncoder';
import {
  StoredRecording,
  getAllRecordings,
  saveRecordingToDB,
  deleteRecordingFromDB,
  clearAllRecordingsFromDB,
  getStorageEstimate,
} from './utils/storage';
import { LiveVisualizer } from './components/LiveVisualizer';
import { AudioPlayer } from './components/AudioPlayer';
import { RecordingHistory } from './components/RecordingHistory';
import { ToolsPanel } from './components/ToolsPanel';
import { PrivacyBanner } from './components/PrivacyBanner';
import { Header, ActiveTab } from './components/Header';
import { OfflineIndicator } from './components/OfflineIndicator';
import { usePWAInstall } from './hooks/usePWAInstall';

export default function App() {
  const {
    status,
    recordingTime,
    audioBuffer,
    analyserNode,
    audioLevel,
    audioDb,
    error,
    autoGain,
    manualGain,
    noiseSuppression,
    selectedDeviceId,
    availableDevices,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    loadAudioBuffer,
    setAutoGain,
    setManualGain,
    setNoiseSuppression,
    setSelectedDeviceId,
    clearError,
  } = useAudioRecorder();

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<ActiveTab>('recorder');

  // Normalization states
  const [autoNormalize, setAutoNormalize] = useState<boolean>(true);
  const [normalizationResult, setNormalizationResult] = useState<NormalizationResult | null>(null);
  const [isNormalizedActive, setIsNormalizedActive] = useState<boolean>(true);

  // User input states
  const [recordingName, setRecordingName] = useState<string>('');
  const [bitrate, setBitrate] = useState<number>(192);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);
  const [encodingProgress, setEncodingProgress] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  // Trim range for saving
  const [trimRange, setTrimRange] = useState<{ startSec: number; endSec: number } | null>(null);

  // Compute normalization when audioBuffer changes
  useEffect(() => {
    if (audioBuffer) {
      const res = normalizeAudioBuffer(audioBuffer, 0.95);
      setNormalizationResult(res);
      setIsNormalizedActive(res.wasBoosted && autoNormalize);
    } else {
      setNormalizationResult(null);
      setIsNormalizedActive(false);
    }
  }, [audioBuffer, autoNormalize]);

  // The active audio buffer (normalized or original)
  const effectiveAudioBuffer =
    isNormalizedActive && normalizationResult?.wasBoosted
      ? normalizationResult.normalizedBuffer
      : audioBuffer;

  // Persistent IndexedDB recordings
  const [historyItems, setHistoryItems] = useState<StoredRecording[]>([]);
  const [storageUsedBytes, setStorageUsedBytes] = useState<number>(0);
  const [storageQuotaBytes, setStorageQuotaBytes] = useState<number>(0);

  // Modals
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);

  // PWA install state
  const { isInstalled: isPWAInstalled } = usePWAInstall();

  // Load recordings from IndexedDB on startup
  const loadStoredData = useCallback(async () => {
    try {
      const items = await getAllRecordings();
      setHistoryItems(items);

      const est = await getStorageEstimate();
      setStorageUsedBytes(est.usedBytes);
      setStorageQuotaBytes(est.quotaBytes);
    } catch (err) {
      console.error('Error loading IndexedDB recordings:', err);
    }
  }, []);

  useEffect(() => {
    loadStoredData();
  }, [loadStoredData]);

  // Handle Cancel / Avbryt
  const handleCancelRecording = useCallback(() => {
    resetRecording();
    setRecordingName('');
    setTrimRange(null);
  }, [resetRecording]);

  // Global Keyboard shortcuts: [Mellanslag] to Start/Paus/Stopp, [Esc] to Avbryt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is currently typing in an input field
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') {
        return;
      }

      // [Esc] = Avbryt
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showHelpModal) {
          setShowHelpModal(false);
          return;
        }
        if (status === 'recording' || status === 'paused' || status === 'ready') {
          handleCancelRecording();
        }
        return;
      }

      // [Mellanslag] = Start / Pausa / Stoppa inspelning
      if (e.code === 'Space') {
        e.preventDefault();
        if (status === 'idle') {
          setActiveTab('recorder');
          startRecording();
        } else if (status === 'recording') {
          pauseRecording();
        } else if (status === 'paused') {
          resumeRecording();
        }
      } else if (e.code === 'KeyS' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (audioBuffer && status === 'ready') {
          handleSaveMp3();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [status, audioBuffer, showHelpModal, handleCancelRecording, startRecording, pauseRecording, resumeRecording]);

  // Handle saving MP3 and storing in IndexedDB
  const handleSaveMp3 = async () => {
    const bufferToEncode = effectiveAudioBuffer || audioBuffer;
    if (!bufferToEncode) return;

    try {
      setIsEncoding(true);
      setEncodingProgress(0);

      const startSec = trimRange?.startSec ?? 0;
      const endSec = trimRange?.endSec ?? bufferToEncode.duration;

      const mp3Blob = await convertAudioBufferToMp3(bufferToEncode, {
        bitrate,
        startSec,
        endSec,
        onProgress: (p) => setEncodingProgress(p),
      });

      const effectiveFilename = sanitizeFilename(recordingName || 'inspelning');

      // Trigger client-side download to "Hämtade filer"
      triggerDownload(mp3Blob, effectiveFilename);

      // Save to IndexedDB for persistent storage
      const newItem: StoredRecording = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        name: effectiveFilename,
        blob: mp3Blob,
        duration: endSec - startSec,
        createdAt: Date.now(),
        size: mp3Blob.size,
      };

      await saveRecordingToDB(newItem);
      await loadStoredData();

      // Confetti celebration
      confetti({
        particleCount: 50,
        spread: 70,
        origin: { y: 0.7 },
        colors: ['#f43f5e', '#fb7185', '#10b981', '#38bdf8'],
      });

      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4500);
    } catch (err) {
      console.error('Save error:', err);
      alert('Ett fel inträffade vid skapandet av MP3-filen.');
    } finally {
      setIsEncoding(false);
    }
  };

  // Delete recording from IndexedDB
  const handleDeleteItem = async (id: string) => {
    await deleteRecordingFromDB(id);
    await loadStoredData();
  };

  // Rename recording in IndexedDB
  const handleRenameItem = async (id: string, newName: string) => {
    const item = historyItems.find((i) => i.id === id);
    if (item) {
      const updated = { ...item, name: newName };
      await saveRecordingToDB(updated);
      await loadStoredData();
    }
  };

  // Clear all recordings from IndexedDB
  const handleClearAllItems = async () => {
    await clearAllRecordingsFromDB();
    await loadStoredData();
  };

  // Load a stored recording into the main review player
  const handleLoadItemInPlayer = async (item: StoredRecording) => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const arrayBuffer = await item.blob.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);

      setRecordingName(item.name.replace(/\.mp3$/i, ''));
      loadAudioBuffer(decoded, item.blob);
      setActiveTab('recorder');
    } catch (err) {
      console.error('Could not load audio for preview:', err);
      triggerDownload(item.blob, item.name);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500/30 selection:text-rose-200">
      {/* Top Bar Header with Tabs and PWA Install */}
      <Header
        activeTab={activeTab}
        onSelectTab={(tab) => setActiveTab(tab)}
        historyCount={historyItems.length}
        onOpenHelp={() => setShowHelpModal(true)}
      />

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col gap-6">
        {/* Error notification banner */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-rose-200">Mikrofonproblem</p>
                <p className="mt-0.5 text-rose-300/90">{error}</p>
              </div>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-200 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB 1: INSPELARE (Studio Recording & Review) */}
        {activeTab === 'recorder' && (
          <div className="flex flex-col gap-6 animate-in fade-in duration-200">
            <section className="w-full rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 flex flex-col gap-6 relative overflow-hidden">
              {/* Subtle background glow */}
              <div className="absolute top-0 right-1/4 -mt-20 w-80 h-80 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

              {/* Top Form Row: Recording Name & Settings button */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label
                    htmlFor="recording-name"
                    className="text-xs font-semibold text-slate-300 flex items-center gap-1.5"
                  >
                    <span>Namn på inspelningen</span>
                    <span className="text-slate-500 font-normal">(valfritt)</span>
                  </label>
                  <div className="relative">
                    <input
                      id="recording-name"
                      type="text"
                      value={recordingName}
                      onChange={(e) => setRecordingName(e.target.value)}
                      placeholder="inspelning (lämna tomt för inspelning.mp3)"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:border-rose-500 transition-all"
                    />
                    <span className="absolute right-3 top-2.5 text-xs font-mono text-slate-500 select-none">
                      .mp3
                    </span>
                  </div>
                </div>

                {/* Auto Volume & Settings Controls */}
                <div className="flex items-center gap-2 self-end sm:self-auto pt-1 sm:pt-5">
                  {/* Volym (auto) Toggle */}
                  <button
                    type="button"
                    onClick={() => setAutoGain(!autoGain)}
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border transition-colors ${
                      autoGain
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    title="Automatisk volymjustering (Auto Gain Control)"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Volym (auto):</span>
                    <span className="font-semibold">{autoGain ? 'PÅ' : 'AV'}</span>
                  </button>

                  {/* Extra Audio Settings toggle */}
                  <button
                    type="button"
                    onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
                    className={`p-2.5 rounded-xl border transition-colors ${
                      showSettingsDrawer
                        ? 'bg-slate-800 border-slate-700 text-slate-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                    title="Snabbinställningar"
                  >
                    <Settings2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Collapsible Audio Settings drawer */}
              {showSettingsDrawer && (
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-4 text-xs animate-in slide-in-from-top-2">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 font-medium">
                    <span>Snabbinställningar</span>
                    <button
                      onClick={() => setActiveTab('tools')}
                      className="text-rose-400 hover:text-rose-300 text-[11px]"
                    >
                      Alla inställningar →
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {/* Microphone Source */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 font-medium">Mikrofon</label>
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        disabled={status === 'recording' || status === 'paused'}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-rose-500 disabled:opacity-50"
                      >
                        {availableDevices.length > 0 ? (
                          availableDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId}>
                              {d.label}
                            </option>
                          ))
                        ) : (
                          <option value="">Standardmikrofon</option>
                        )}
                      </select>
                    </div>

                    {/* MP3 Bitrate */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-slate-300 font-medium">Kvalitet</label>
                      <div className="flex items-center gap-1">
                        {[128, 192, 320].map((b) => (
                          <button
                            key={b}
                            onClick={() => setBitrate(b)}
                            className={`flex-1 py-1.5 rounded-lg font-mono text-center transition-colors ${
                              bitrate === b
                                ? 'bg-rose-600 text-white font-medium'
                                : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {b}k
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Manual Gain */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-slate-300">
                        <span className="font-medium">Förstärkning</span>
                        <span className="font-mono text-slate-400">
                          {(manualGain * 100).toFixed(0)}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.2}
                        max={2.5}
                        step={0.1}
                        value={manualGain}
                        disabled={autoGain}
                        onChange={(e) => setManualGain(parseFloat(e.target.value))}
                        className={`w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer ${
                          autoGain ? 'opacity-40 cursor-not-allowed' : ''
                        }`}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Central Recording or Review Stage */}
              {status !== 'ready' || !audioBuffer ? (
                <div className="flex flex-col items-center justify-center py-6 sm:py-10 gap-6">
                  {/* Timer Display */}
                  <div className="flex flex-col items-center">
                    <span className="text-4xl sm:text-5xl font-mono font-bold tracking-tight text-white tabular-nums drop-shadow-sm">
                      {formatTime(recordingTime)}
                    </span>
                    <span className="text-xs text-slate-500 mt-1">
                      {status === 'recording'
                        ? 'Inspelning pågår...'
                        : status === 'paused'
                        ? 'Inspelning pausad'
                        : 'Tryck på mikrofonen för att börja spela in'}
                    </span>
                  </div>

                  {/* Main Microphone Button */}
                  <div className="relative flex items-center justify-center">
                    {/* Pulsing ring during active recording */}
                    {status === 'recording' && (
                      <div className="absolute w-36 h-36 rounded-full bg-rose-500/20 animate-ping pointer-events-none" />
                    )}

                    {status === 'idle' && (
                      <button
                        onClick={startRecording}
                        className="relative z-10 w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center shadow-lg shadow-rose-950/60 transition-all hover:scale-105 active:scale-95 group focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500/40"
                        title="Börja spela in (eller tryck Mellanslag)"
                      >
                        <Mic className="w-10 h-10 group-hover:scale-110 transition-transform" />
                        <span className="text-[11px] font-semibold tracking-wide uppercase mt-1">
                          Spela in
                        </span>
                      </button>
                    )}

                    {status === 'recording' && (
                      <div className="relative z-10 flex items-center gap-4">
                        <button
                          onClick={pauseRecording}
                          className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 flex items-center justify-center shadow-md transition-transform active:scale-95"
                          title="Pausa inspelning (eller tryck Mellanslag)"
                        >
                          <Pause className="w-6 h-6 fill-current" />
                        </button>

                        <button
                          onClick={stopRecording}
                          className="w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center shadow-lg shadow-rose-950/60 transition-transform active:scale-95"
                          title="Stoppa och gå till spara"
                        >
                          <Square className="w-7 h-7 fill-current" />
                          <span className="text-[10px] font-semibold uppercase mt-0.5">
                            Klar
                          </span>
                        </button>
                      </div>
                    )}

                    {status === 'paused' && (
                      <div className="relative z-10 flex items-center gap-4">
                        <button
                          onClick={resumeRecording}
                          className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                          title="Återuppta inspelning (eller tryck Mellanslag)"
                        >
                          <Play className="w-7 h-7 fill-current ml-0.5" />
                        </button>

                        <button
                          onClick={stopRecording}
                          className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center shadow-md transition-transform active:scale-95"
                          title="Stoppa och lyssna"
                        >
                          <Square className="w-5 h-5 fill-current" />
                        </button>
                      </div>
                    )}

                    {status === 'processing' && (
                      <div className="w-24 h-24 rounded-full bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-slate-400">
                        <div className="w-6 h-6 border-2 border-rose-500 border-t-transparent rounded-full animate-spin mb-1" />
                        <span className="text-[10px]">Bearbetar...</span>
                      </div>
                    )}
                  </div>

                  {/* Cancel / Avbryt helper during active recording */}
                  {(status === 'recording' || status === 'paused') && (
                    <button
                      onClick={handleCancelRecording}
                      className="text-xs text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1"
                    >
                      <span>Avbryt inspelning</span>
                      <kbd className="px-1 py-0.2 rounded bg-slate-800 text-[10px]">Esc</kbd>
                    </button>
                  )}

                  {/* Live Waveform & VU meter */}
                  <div className="w-full max-w-xl">
                    <LiveVisualizer
                      analyserNode={analyserNode}
                      isRecording={status === 'recording'}
                      isPaused={status === 'paused'}
                      audioLevel={audioLevel}
                      audioDb={audioDb}
                    />
                  </div>

                  {/* Informative Swedish Prompt Text */}
                  <p className="text-xs text-slate-400 text-center max-w-md leading-relaxed">
                    Spela in ljud från datorns mikrofon och lyssna på hur det låter. När du är nöjd sparar du en MP3-fil som laddas ned till mappen &quot;Hämtade filer&quot;.
                  </p>
                </div>
              ) : (
                /* Review & Playback Screen with Real-Time Waveform Markers */
                <div className="flex flex-col gap-6 py-2 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                      <h3 className="text-base font-semibold text-white">
                        Inspelning klar – lyssna på hur det låter
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-slate-400">
                      Längd: {formatTime(audioBuffer.duration)}
                    </span>
                  </div>

                  {/* Normalization Control Bar */}
                  {normalizationResult && (
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/90 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            isNormalizedActive && normalizationResult.wasBoosted
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-900 text-slate-400 border border-slate-800'
                          }`}
                        >
                          <Volume2 className="w-4 h-4" />
                        </div>

                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200">Volymnormalisering</span>
                            {normalizationResult.wasBoosted ? (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-mono text-[10px] font-semibold border border-emerald-500/20">
                                +{normalizationResult.gainDb.toFixed(1)} dB förstärkning
                              </span>
                            ) : (
                              <span className="text-slate-500 text-[10px]">Optimal nivå nådd (topp: {normalizationResult.originalPeakDb.toFixed(1)} dBFS)</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {normalizationResult.wasBoosted
                              ? isNormalizedActive
                                ? `Volymen har höjts från ${normalizationResult.originalPeakDb.toFixed(1)} dBFS till optimal toppnivå (-0.5 dBFS) utan klippning eller distorsion.`
                                : `Normalisering avstängd. Visar originalvolym (${normalizationResult.originalPeakDb.toFixed(1)} dBFS).`
                              : `Inspelningens toppnivå är redan välbalanserad utan risk för distorsion.`}
                          </p>
                        </div>
                      </div>

                      {normalizationResult.wasBoosted && (
                        <button
                          onClick={() => setIsNormalizedActive(!isNormalizedActive)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all shrink-0 flex items-center gap-1.5 active:scale-95 ${
                            isNormalizedActive
                              ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                              : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Normaliserad: {isNormalizedActive ? 'PÅ' : 'AV'}</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Audio Waveform Player with Real-Time Markers */}
                  <AudioPlayer
                    key={isNormalizedActive ? 'normalized' : 'original'}
                    audioBuffer={effectiveAudioBuffer || audioBuffer}
                    onTrimChange={(range) => setTrimRange(range)}
                  />

                  {/* Download Success Notice */}
                  {downloadSuccess && (
                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        MP3-filen har sparats i webbläsarens IndexedDB och laddats ned till <strong>&quot;Hämtade filer&quot;</strong>.
                      </span>
                    </div>
                  )}

                  {/* Action Buttons Row */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                    <button
                      onClick={handleCancelRecording}
                      className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Spela in igen</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-slate-900 text-[10px] text-slate-400">Esc</kbd>
                    </button>

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                      <button
                        onClick={handleSaveMp3}
                        disabled={isEncoding}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-rose-800/60 text-white text-sm font-semibold shadow-lg shadow-rose-950/50 transition-all hover:scale-105 active:scale-95 disabled:cursor-not-allowed"
                      >
                        {isEncoding ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            <span>Sparar MP3 ({encodingProgress}%)...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            <span>Spara MP3</span>
                            <kbd className="px-1.5 py-0.5 rounded bg-rose-700 text-[10px] text-rose-100">Ctrl+S</kbd>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Explanatory text */}
                  <p className="text-xs text-slate-400 text-center leading-relaxed">
                    Skriv ett namn i fältet ovan innan du sparar – annars heter filen{' '}
                    <code className="text-rose-300 font-mono">inspelning.mp3</code>.
                  </p>
                </div>
              )}
            </section>

            {/* Privacy Card on main page */}
            <PrivacyBanner />
          </div>
        )}

        {/* TAB 2: HISTORIK (IndexedDB Persistent Storage & ZIP Export) */}
        {activeTab === 'history' && (
          <RecordingHistory
            items={historyItems}
            onPlayItem={handleLoadItemInPlayer}
            onDeleteItem={handleDeleteItem}
            onRenameItem={handleRenameItem}
            onClearAll={handleClearAllItems}
            onNavigateToRecorder={() => setActiveTab('recorder')}
            storageUsedBytes={storageUsedBytes}
          />
        )}

        {/* TAB 3: VERKTYG & INSTÄLLNINGAR */}
        {activeTab === 'tools' && (
          <ToolsPanel
            autoGain={autoGain}
            onToggleAutoGain={() => setAutoGain(!autoGain)}
            manualGain={manualGain}
            onChangeManualGain={(val) => setManualGain(val)}
            noiseSuppression={noiseSuppression}
            onToggleNoiseSuppression={() => setNoiseSuppression(!noiseSuppression)}
            selectedDeviceId={selectedDeviceId}
            onSelectDeviceId={(id) => setSelectedDeviceId(id)}
            availableDevices={availableDevices}
            bitrate={bitrate}
            onChangeBitrate={(b) => setBitrate(b)}
            autoNormalize={autoNormalize}
            onToggleAutoNormalize={() => setAutoNormalize(!autoNormalize)}
            storageUsedBytes={storageUsedBytes}
            storageQuotaBytes={storageQuotaBytes}
            totalRecordingsCount={historyItems.length}
            onClearAllRecordings={handleClearAllItems}
            isPWAInstalled={isPWAInstalled}
          />
        )}
      </main>

      {/* Offline Toast notification */}
      <OfflineIndicator />

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Enkel Ljudinspelare · Modern Progressiv Webbapp (PWA)</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span>Privat & GDPR-säker</span>
            <span>·</span>
            <span>Lokal IndexedDB-lagring</span>
          </span>
        </div>
      </footer>

      {/* Help & Shortcuts Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 flex flex-col gap-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-rose-400" />
                <span>Instruktioner & Genvägar</span>
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs text-slate-300 leading-relaxed">
              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  1
                </div>
                <p>
                  <strong>Starta & pausa:</strong> Tryck på mikrofonen eller tryck på <code>Mellanslag</code> på tangentbordet för att starta, pausa eller återuppta inspelningen.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  2
                </div>
                <p>
                  <strong>Avbryt:</strong> Tryck på <code>Esc</code> för att omedelbart avbryta och nollställa inspelningen.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  3
                </div>
                <p>
                  <strong>Realtids-markörer:</strong> Tryck på <code>M</code> under uppspelning eller dubbelklicka på vågformen för att sätta bokmärken. Använd <code>[</code> och <code>]</code> för att hoppa mellan markörer.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  4
                </div>
                <p>
                  <strong>Bestående lagring & ZIP-export:</strong> Alla inspelningar sparas i webbläsarens IndexedDB. I fliken &quot;Historik&quot; kan du ladda ned alla sparade filer som en samlad ZIP.
                </p>
              </div>

              {/* Keyboard shortcuts table */}
              <div className="mt-2 pt-3 border-t border-slate-800 flex flex-col gap-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5 text-rose-400" />
                  Snabbkommandon
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Start / Paus</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                      Mellanslag
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Avbryt</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                      Esc
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Sätt markör</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                      M
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Föreg / Nästa</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                      [ / ]
                    </kbd>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowHelpModal(false)}
              className="mt-2 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
            >
              Stäng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
