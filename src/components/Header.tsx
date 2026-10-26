import React from 'react';
import { Mic, Shield, HelpCircle } from 'lucide-react';

interface HeaderProps {
  onOpenHelp: () => void;
  onOpenPrivacy: () => void;
  onNewRecording: () => void;
  hasActiveRecording: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenHelp,
  onOpenPrivacy,
  onNewRecording,
  hasActiveRecording,
}) => {
  return (
    <header className="w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand title, one line */}
        <div className="flex items-center gap-3 whitespace-nowrap shrink-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-rose-600 to-rose-400 text-white flex items-center justify-center shadow-md shadow-rose-950/50">
            <Mic className="w-5 h-5" />
          </div>
          <span className="text-base font-bold tracking-tight text-white">
            Enkel Ljudinspelare
          </span>
        </div>

        {/* Zone 2: Nav links, 1-2 word labels, single-line */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
          <button
            onClick={onOpenHelp}
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Instruktioner</span>
          </button>
          <button
            onClick={onOpenPrivacy}
            className="hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
          >
            <Shield className="w-4 h-4" />
            <span>GDPR & Säkerhet</span>
          </button>
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {hasActiveRecording && (
            <button
              onClick={onNewRecording}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Ny inspelning
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
