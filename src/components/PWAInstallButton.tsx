import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState<boolean>(false);

  // If already installed, hide
  if (isInstalled) {
    return (
      <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        <span>Installerad</span>
      </span>
    );
  }

  // Desktop Chrome/Edge & Android flow
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium shadow-sm transition-all active:scale-95 whitespace-nowrap shrink-0"
        title="Installera som app på din dator eller telefon"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Installera app</span>
      </button>
    );
  }

  // iOS Safari flow
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors whitespace-nowrap shrink-0"
          title="Installera på iPhone eller iPad"
        >
          <Smartphone className="w-3.5 h-3.5 text-rose-400" />
          <span>Installera på iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-800 p-6 shadow-2xl flex flex-col gap-4 text-xs">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Smartphone className="w-4 h-4 text-rose-400" />
                  Installera på iPhone / iPad
                </h3>
                <button
                  onClick={() => setShowIOSGuide(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 text-slate-300 leading-relaxed">
                <p>
                  1. Tryck på <strong>Dela-knappen</strong> (fyrkant med pil uppåt) i Safaris verktygsfält.
                </p>
                <p>
                  2. Rulla nedåt och tryck på <strong>Lägg till på hemskärmen</strong>.
                </p>
                <p>
                  3. Tryck på <strong>Lägg till</strong> i övre högra hörnet. Nu kan du använda inspelaren som en fristående app helt utan internetanslutning!
                </p>
              </div>

              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-2 w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium"
              >
                Jag förstår
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Default desktop helper button if prompt hasn't fired yet
  return (
    <button
      onClick={() => {
        alert(
          'För att installera appen:\nI Google Chrome eller Edge klickar du på installationsikonen i webbläsarens adressfält (eller menyn ... > Installera Enkel Ljudinspelare).'
        );
      }}
      className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium border border-slate-800 transition-colors whitespace-nowrap shrink-0"
      title="Installera som PWA-app"
    >
      <Download className="w-3.5 h-3.5" />
      <span>Installera</span>
    </button>
  );
};
