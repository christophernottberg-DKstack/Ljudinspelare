import React, { useState } from 'react';
import { ShieldCheck, HardDrive, EyeOff, Lock, ChevronDown, ChevronUp } from 'lucide-react';

export const PrivacyBanner: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  return (
    <div className="w-full rounded-2xl bg-slate-900/80 border border-slate-800 p-5 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-slate-100">
                100% Lokal & GDPR-säker inspelning
              </h4>
              <span className="text-xs text-emerald-400 font-medium">Verifierad</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-2xl">
              All inspelning sker lokalt på din dator – ingen information lämnar din enhet. Helt GDPR-säkert. Tack för att du prioriterar integritet och användarvänlighet i denna tjänst.
            </p>
          </div>
        </div>

        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 shrink-0 py-1 px-2 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <span>{isExpanded ? 'Dölj detaljer' : 'Hur det fungerar'}</span>
          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-400">
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
            <HardDrive className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-200">Körs i webbläsarens minne</p>
              <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                Ljudströmmen bearbetas direkt via Web Audio API i din webbläsares RAM-minne.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
            <EyeOff className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-200">Noll molnuppladdningar</p>
              <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                Inga ljudfiler eller metadata skickas till servrar eller analysverktyg.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800/60">
            <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-slate-200">Klientbaserad MP3-kodning</p>
              <p className="text-slate-400 mt-0.5 text-[11px] leading-relaxed">
                Konverteringen till MP3 sker helt på din processor med WebAssembly/JavaScript.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
