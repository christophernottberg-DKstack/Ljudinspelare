import { useState, useRef, useEffect } from 'react';
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
  FileAudio,
  AlertTriangle,
  Keyboard,
  Info,
  X,
  Volume2,
} from 'lucide-react';
import { useAudioRecorder } from './hooks/useAudioRecorder';
import {
  convertAudioBufferToMp3,
  formatTime,
  sanitizeFilename,
  triggerDownload,
} from './utils/audioEncoder';
import { LiveVisualizer } from './components/LiveVisualizer';
import { AudioPlayer } from './components/AudioPlayer';
import { RecordingHistory, SavedRecordingItem } from './components/RecordingHistory';
import { PrivacyBanner } from './components/PrivacyBanner';
import { Header } from './components/Header';

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
    selectedDeviceId,
    availableDevices,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    resetRecording,
    setAutoGain,
    setManualGain,
    setSelectedDeviceId,
    clearError,
  } = useAudioRecorder();

  // User input states
  const [recordingName, setRecordingName] = useState<string>('');
  const [bitrate, setBitrate] = useState<number>(192);
  const [isEncoding, setIsEncoding] = useState<boolean>(false);
  const [encodingProgress, setEncodingProgress] = useState<number>(0);
  const [downloadSuccess, setDownloadSuccess] = useState<boolean>(false);

  // Trim range for saving
  const [trimRange, setTrimRange] = useState<{ startSec: number; endSec: number } | null>(null);

  // Session history
  const [historyItems, setHistoryItems] = useState<SavedRecordingItem[]>([]);

  // Modals
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState<boolean>(false);

  const privacySectionRef = useRef<HTMLDivElement | null>(null);

  // Keyboard shortcut listener (Space to record / pause)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in the filename input
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (status === 'idle') {
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
  }, [status, audioBuffer]);

  // Handle saving MP3
  const handleSaveMp3 = async () => {
    if (!audioBuffer) return;

    try {
      setIsEncoding(true);
      setEncodingProgress(0);

      const startSec = trimRange?.startSec ?? 0;
      const endSec = trimRange?.endSec ?? audioBuffer.duration;

      const mp3Blob = await convertAudioBufferToMp3(audioBuffer, {
        bitrate,
        startSec,
        endSec,
        onProgress: (p) => setEncodingProgress(p),
      });

      const effectiveFilename = sanitizeFilename(recordingName || 'inspelning');
      triggerDownload(mp3Blob, effectiveFilename);

      // Add to session history
      const newItem: SavedRecordingItem = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
        name: effectiveFilename,
        blob: mp3Blob,
        duration: endSec - startSec,
        createdAt: new Date(),
      };

      setHistoryItems((prev) => [newItem, ...prev]);

      // Trigger celebratory confetti
      confetti({
        particleCount: 45,
        spread: 60,
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

  const handleStartAgain = () => {
    resetRecording();
    setRecordingName('');
    setTrimRange(null);
  };

  const scrollToPrivacy = () => {
    privacySectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500/30 selection:text-rose-200">
      {/* Top Bar Header */}
      <Header
        onOpenHelp={() => setShowHelpModal(true)}
        onOpenPrivacy={scrollToPrivacy}
        onNewRecording={handleStartAgain}
        hasActiveRecording={status === 'ready'}
      />

      {/* Main Container */}
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

        {/* Central Card */}
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
                title="Fler ljudinställningar"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Collapsible Audio Settings drawer */}
          {showSettingsDrawer && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col gap-4 text-xs animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-slate-400 font-medium">
                <span>Avancerade ljudinställningar</span>
                <span className="text-[11px] text-slate-500">Tillämpas lokalt</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {/* Microphone Source */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-slate-300 font-medium">Mikrofonkälla</label>
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
                  <label className="text-slate-300 font-medium">MP3-kvalitet</label>
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

                {/* Manual Gain slider (visible when autoGain is off) */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="font-medium">Manuell förstärkning</span>
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
                  {autoGain && (
                    <span className="text-[10px] text-slate-500">
                      Stäng av &quot;Volym (auto)&quot; för att justera manuellt
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Central Recording / Review Section */}
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
                    title="Börja spela in"
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
                      title="Pausa inspelning"
                    >
                      <Pause className="w-6 h-6 fill-current" />
                    </button>

                    <button
                      onClick={stopRecording}
                      className="w-20 h-20 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex flex-col items-center justify-center shadow-lg shadow-rose-950/60 transition-transform active:scale-95"
                      title="Stoppa och lyssna"
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
                      title="Återuppta inspelning"
                    >
                      <Play className="w-7 h-7 fill-current ml-0.5" />
                    </button>

                    <button
                      onClick={stopRecording}
                      className="w-14 h-14 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center justify-center shadow-md transition-transform active:scale-95"
                      title="Stoppa och gå till spara"
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

              {/* Informative Prompt Text */}
              <p className="text-xs text-slate-400 text-center max-w-md leading-relaxed">
                Spela in ljud från datorns mikrofon och lyssna på hur det låter. När du är nöjd sparar du en MP3-fil som laddas ned till mappen &quot;Hämtade filer&quot;.
              </p>
            </div>
          ) : (
            /* Review & Playback Screen */
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

              {/* Audio Waveform Player */}
              <AudioPlayer
                audioBuffer={audioBuffer}
                onTrimChange={(range) => setTrimRange(range)}
              />

              {/* Download Success Notice */}
              {downloadSuccess && (
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    MP3-filen har laddats ned till din dators mapp <strong>&quot;Hämtade filer&quot;</strong>.
                  </span>
                </div>
              )}

              {/* Action Buttons Row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-2">
                <button
                  onClick={handleStartAgain}
                  className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Spela in igen</span>
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

        {/* Previous Session Recordings History */}
        <RecordingHistory
          items={historyItems}
          onPlayItem={(item) => {
            // Load previous item into player
            const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            item.blob.arrayBuffer().then((buf) => {
              ctx.decodeAudioData(buf).then((decoded) => {
                // We could play it or trigger download
                triggerDownload(item.blob, item.name);
              });
            });
          }}
          onDeleteItem={(id) => {
            setHistoryItems((prev) => prev.filter((i) => i.id !== id));
          }}
          onClearAll={() => setHistoryItems([])}
        />

        {/* Privacy & GDPR Verification Banner */}
        <div ref={privacySectionRef}>
          <PrivacyBanner />
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Enkel Ljudinspelare · Modern webbapplikation</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <span>Privat & GDPR-säker</span>
            <span>·</span>
            <span>Ingen serverlagring</span>
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
                <span>Instruktioner & Tips</span>
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
                  <strong>Starta inspelning:</strong> Klicka på mikrofonen. Första gången ber din webbläsare om tillåtelse att använda mikrofonen.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  2
                </div>
                <p>
                  <strong>Volym (auto):</strong> Justerar automatiskt ingångsvolymen så att rösten varken blir för svag eller klipper.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  3
                </div>
                <p>
                  <strong>Lyssna och klipp:</strong> Granska ditt resultat med vågformen. Använd klippverktyget om du vill trimma början eller slutet.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <div className="w-5 h-5 rounded-md bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0 font-bold">
                  4
                </div>
                <p>
                  <strong>Spara MP3:</strong> Filen konverteras direkt till äkta MP3 lokalt på din dator och sparas i mappen &quot;Hämtade filer&quot;.
                </p>
              </div>

              {/* Keyboard shortcuts */}
              <div className="mt-2 pt-3 border-t border-slate-800 flex flex-col gap-2">
                <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5" />
                  Tangentbordsgenvägar
                </span>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Start / Paus</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                      Mellanslag
                    </kbd>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800">
                    <span className="text-slate-400">Spara MP3</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-slate-200">
                      Ctrl + S
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
