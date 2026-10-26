import React from 'react';
import {
  Mic,
  Sliders,
  HardDrive,
  Keyboard,
  ShieldCheck,
  Smartphone,
  Trash2,
  CheckCircle2,
  Volume2,
} from 'lucide-react';
import { AudioDevice } from '../hooks/useAudioRecorder';
import { formatFileSize } from '../utils/audioEncoder';

interface ToolsPanelProps {
  // Audio settings
  autoGain: boolean;
  onToggleAutoGain: () => void;
  manualGain: number;
  onChangeManualGain: (val: number) => void;
  noiseSuppression: boolean;
  onToggleNoiseSuppression: () => void;
  selectedDeviceId: string;
  onSelectDeviceId: (id: string) => void;
  availableDevices: AudioDevice[];
  bitrate: number;
  onChangeBitrate: (b: number) => void;
  // Normalization
  autoNormalize: boolean;
  onToggleAutoNormalize: () => void;
  // Storage
  storageUsedBytes: number;
  storageQuotaBytes: number;
  totalRecordingsCount: number;
  onClearAllRecordings: () => void;
  // PWA
  isPWAInstalled: boolean;
}

export const ToolsPanel: React.FC<ToolsPanelProps> = ({
  autoGain,
  onToggleAutoGain,
  manualGain,
  onChangeManualGain,
  noiseSuppression,
  onToggleNoiseSuppression,
  selectedDeviceId,
  onSelectDeviceId,
  availableDevices,
  bitrate,
  onChangeBitrate,
  autoNormalize,
  onToggleAutoNormalize,
  storageUsedBytes,
  storageQuotaBytes,
  totalRecordingsCount,
  onClearAllRecordings,
  isPWAInstalled,
}) => {
  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in duration-200">
      {/* 1. Ljud & Inspelningsinställningar */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col gap-5">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Ljud- och inspelningsinställningar</h3>
            <p className="text-xs text-slate-400">Konfigurera mikrofon, automatisk volym och kodningskvalitet</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Microphone Selector */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300">Mikrofonenhet</label>
            <select
              value={selectedDeviceId}
              onChange={(e) => onSelectDeviceId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
            >
              {availableDevices.length > 0 ? (
                availableDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label}
                  </option>
                ))
              ) : (
                <option value="">Standardmikrofon (System)</option>
              )}
            </select>
            <span className="text-[11px] text-slate-500">
              Växla mellan inbyggd mikrofon, USB-mikrofon eller headset.
            </span>
          </div>

          {/* MP3 Bitrate */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-300">MP3-kodningskvalitet</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { val: 128, label: '128 kbps', desc: 'Standard' },
                { val: 192, label: '192 kbps', desc: 'Hög (rekommenderas)' },
                { val: 320, label: '320 kbps', desc: 'Studio' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => onChangeBitrate(opt.val)}
                  className={`p-2 rounded-xl border text-left transition-colors ${
                    bitrate === opt.val
                      ? 'bg-rose-500/10 border-rose-500 text-white shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div className="font-mono text-xs font-semibold">{opt.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Volym (auto) & Manual Boost */}
          <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-rose-400" />
                  Volym (auto) / AGC
                </span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Justerar dynamiskt förstärkningen för jämn röststyrka
                </p>
              </div>

              <button
                onClick={onToggleAutoGain}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  autoGain
                    ? 'bg-rose-600 text-white border-rose-500'
                    : 'bg-slate-900 text-slate-400 border-slate-700'
                }`}
              >
                {autoGain ? 'PÅ' : 'AV'}
              </button>
            </div>

            {!autoGain && (
              <div className="pt-3 border-t border-slate-800 flex flex-col gap-2 animate-in fade-in">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-300 font-medium">Manuell förstärkning</span>
                  <span className="font-mono text-rose-400">{(manualGain * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min={0.2}
                  max={2.5}
                  step={0.1}
                  value={manualGain}
                  onChange={(e) => onChangeManualGain(parseFloat(e.target.value))}
                  className="w-full accent-rose-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            )}
          </div>

          {/* Noise suppression toggle */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800/80">
            <div>
              <span className="text-xs font-semibold text-slate-200">Brusreducering</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Dämpar bakgrundsbrus och fläktljud från datorn
              </p>
            </div>

            <button
              onClick={onToggleNoiseSuppression}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                noiseSuppression
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              {noiseSuppression ? 'Aktiv' : 'Inaktiv'}
            </button>
          </div>

          {/* Auto Normalization setting */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-950 border border-slate-800/80 md:col-span-2">
            <div>
              <span className="text-xs font-semibold text-slate-200">Automatisk volymnormalisering</span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Höjer automatiskt volymen på tysta inspelningar till optimal toppnivå (-0.5 dBFS) utan klippning eller distorsion
              </p>
            </div>

            <button
              onClick={onToggleAutoNormalize}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0 ${
                autoNormalize
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-900 text-slate-400 border-slate-700'
              }`}
            >
              {autoNormalize ? 'PÅ' : 'AV'}
            </button>
          </div>
        </div>
      </div>

      {/* 2. Tangentbordsgenvägar & Navigering */}
      <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col gap-4">
        <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Tangentbordsgenvägar</h3>
            <p className="text-xs text-slate-400">Styr inspelaren och markörer blixtsnabbt med tangentbordet</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-300">Start / Paus / Stopp</span>
            <kbd className="px-2 py-1 rounded bg-slate-800 font-mono text-slate-200 border border-slate-700 font-semibold">
              Mellanslag
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-300">Avbryt inspelning</span>
            <kbd className="px-2 py-1 rounded bg-slate-800 font-mono text-slate-200 border border-slate-700 font-semibold">
              Esc
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-300">Sätt tidsmarkör</span>
            <kbd className="px-2 py-1 rounded bg-slate-800 font-mono text-slate-200 border border-slate-700 font-semibold">
              M
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-300">Föregående markör</span>
            <kbd className="px-2 py-1 rounded bg-slate-800 font-mono text-slate-200 border border-slate-700 font-semibold">
              [
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-300">Nästa markör</span>
            <kbd className="px-2 py-1 rounded bg-slate-800 font-mono text-slate-200 border border-slate-700 font-semibold">
              ]
            </kbd>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <span className="text-slate-300">Spara MP3-fil</span>
            <kbd className="px-2 py-1 rounded bg-slate-800 font-mono text-slate-200 border border-slate-700 font-semibold">
              Ctrl + S
            </kbd>
          </div>
        </div>
      </div>

      {/* 3. Lagring (IndexedDB) & PWA Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* IndexedDB Storage */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between gap-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <HardDrive className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Lokal databas (IndexedDB)</h3>
              <p className="text-xs text-slate-400">Beständig lagring i din webbläsare</p>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Sparade inspelningar:</span>
              <span className="font-mono text-slate-200 font-semibold">{totalRecordingsCount} st</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Använt utrymme:</span>
              <span className="font-mono text-emerald-400 font-semibold">
                {formatFileSize(storageUsedBytes)}
              </span>
            </div>
            {storageQuotaBytes > 0 && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Tillgänglig kvot:</span>
                <span className="font-mono text-slate-400">
                  {formatFileSize(storageQuotaBytes)}
                </span>
              </div>
            )}
          </div>

          {totalRecordingsCount > 0 && (
            <button
              onClick={() => {
                if (confirm('Vill du rensa all historik från webbläsarens IndexedDB?')) {
                  onClearAllRecordings();
                }
              }}
              className="mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-800 text-xs font-medium transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Rensa alla inspelningar från databasen</span>
            </button>
          )}
        </div>

        {/* PWA & Offline Support */}
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl flex flex-col justify-between gap-4">
          <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
            <Smartphone className="w-5 h-5 text-rose-400" />
            <div>
              <h3 className="text-sm font-semibold text-white">Progressiv Webbapp (PWA)</h3>
              <p className="text-xs text-slate-400">Installera som fristående app & kör offline</p>
            </div>
          </div>

          <div className="flex flex-col gap-2 text-xs text-slate-300 leading-relaxed">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Fullt offline-stöd med Service Worker och manifest.</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                {isPWAInstalled
                  ? 'Körs i fristående appfönster (Standalone Mode).'
                  : 'Kan installeras till skrivbordet eller telefonens hemskärm.'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Ingen internetuppkoppling krävs vid användning.</span>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
            Klicka på <strong>Installera app</strong> i rubriken för att lägga till appen på din dator.
          </div>
        </div>
      </div>
    </div>
  );
};
