import React, { useState, useMemo } from 'react';
import {
  Download,
  Trash2,
  FileAudio,
  Play,
  Pause,
  Archive,
  Search,
  HardDrive,
  Edit2,
  Check,
  X,
  Clock,
  Calendar,
} from 'lucide-react';
import { formatTime, formatFileSize, triggerDownload, sanitizeFilename } from '../utils/audioEncoder';
import { StoredRecording, exportAllRecordingsAsZip } from '../utils/storage';

interface RecordingHistoryProps {
  items: StoredRecording[];
  onPlayItem: (item: StoredRecording) => void;
  onDeleteItem: (id: string) => void;
  onRenameItem: (id: string, newName: string) => void;
  onClearAll: () => void;
  onNavigateToRecorder: () => void;
  storageUsedBytes: number;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({
  items,
  onPlayItem,
  onDeleteItem,
  onRenameItem,
  onClearAll,
  onNavigateToRecorder,
  storageUsedBytes,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [zipProgress, setZipProgress] = useState<number>(0);

  // Inline rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>('');

  // Local audio preview playback state
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const query = searchQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(query));
  }, [items, searchQuery]);

  // Handle Export All as ZIP
  const handleExportZip = async () => {
    if (items.length === 0) return;
    try {
      setIsExportingZip(true);
      setZipProgress(0);
      await exportAllRecordingsAsZip(items, (pct) => setZipProgress(pct));
    } catch (err) {
      console.error('ZIP export error:', err);
      alert('Kunde inte skapa ZIP-filen. Försök igen.');
    } finally {
      setIsExportingZip(false);
    }
  };

  // Inline audio preview play/pause
  const togglePlayPreview = (item: StoredRecording) => {
    if (playingId === item.id) {
      if (audioElement) {
        audioElement.pause();
      }
      setPlayingId(null);
    } else {
      if (audioElement) {
        audioElement.pause();
      }
      const url = URL.createObjectURL(item.blob);
      const audio = new Audio(url);
      audio.onended = () => {
        setPlayingId(null);
        URL.revokeObjectURL(url);
      };
      audio.play();
      setAudioElement(audio);
      setPlayingId(item.id);
    }
  };

  const startRename = (item: StoredRecording) => {
    setEditingId(item.id);
    setEditName(item.name.replace(/\.mp3$/i, ''));
  };

  const saveRename = (id: string) => {
    if (editName.trim()) {
      onRenameItem(id, sanitizeFilename(editName.trim()));
    }
    setEditingId(null);
  };

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in duration-200">
      {/* Top Bar inside History: Stats, Search & Export ZIP */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <FileAudio className="w-5 h-5 text-rose-500" />
              <span>Sparade inspelningar</span>
            </h2>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 font-mono text-slate-300">
              {items.length} st
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HardDrive className="w-3.5 h-3.5 text-slate-500" />
            <span>Lagras lokalt i din webbläsare (IndexedDB):</span>
            <span className="font-mono text-slate-300 font-medium">
              {formatFileSize(storageUsedBytes)}
            </span>
          </div>
        </div>

        {/* Batch Export All Button */}
        {items.length > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleExportZip}
              disabled={isExportingZip}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 text-xs font-semibold shadow-md transition-all active:scale-95 disabled:opacity-50"
              title="Ladda ned alla inspelningar som en samlad ZIP-fil"
            >
              <Archive className="w-4 h-4 text-rose-400" />
              <span>
                {isExportingZip
                  ? `Skapar ZIP (${zipProgress}%)...`
                  : `Exportera alla som ZIP (${items.length})`}
              </span>
            </button>

            <button
              onClick={() => {
                if (confirm('Är du säker på att du vill ta bort alla sparade inspelningar?')) {
                  onClearAll();
                }
              }}
              className="p-2.5 rounded-xl bg-slate-950 hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
              title="Rensa hela historiken"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Search Filter Bar */}
      {items.length > 0 && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Sök bland inspelningar efter namn..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-rose-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Recordings List */}
      {items.length === 0 ? (
        /* Empty State */
        <div className="p-12 rounded-2xl bg-slate-900/60 border border-dashed border-slate-800 flex flex-col items-center justify-center gap-4 text-center">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center">
            <FileAudio className="w-7 h-7" />
          </div>
          <div className="flex flex-col gap-1 max-w-sm">
            <h3 className="text-base font-semibold text-white">Inga sparade inspelningar än</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dina inspelningar sparas automatiskt i webbläsarens IndexedDB-databas så att de finns kvar även när du uppdaterar sidan.
            </p>
          </div>
          <button
            onClick={onNavigateToRecorder}
            className="mt-2 px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-md transition-all active:scale-95"
          >
            Gå till Inspelaren
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 bg-slate-900 rounded-xl border border-slate-800">
          Inga inspelningar matchade din sökning &quot;{searchQuery}&quot;.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700/80 transition-all group shadow-sm"
            >
              {/* Left Zone: Play preview button & details */}
              <div className="flex items-center gap-3.5 min-w-0 w-full sm:w-auto">
                <button
                  onClick={() => togglePlayPreview(item)}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all active:scale-95 shadow-sm ${
                    playingId === item.id
                      ? 'bg-rose-600 text-white shadow-rose-950/40'
                      : 'bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white'
                  }`}
                  title={playingId === item.id ? 'Pausa' : 'Spela förhandsgranskning'}
                >
                  {playingId === item.id ? (
                    <Pause className="w-4 h-4 fill-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  )}
                </button>

                <div className="flex flex-col min-w-0 flex-1">
                  {editingId === item.id ? (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveRename(item.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="px-2 py-1 rounded bg-slate-950 border border-slate-700 text-xs text-white outline-none focus:border-rose-500"
                      />
                      <button
                        onClick={() => saveRename(item.id)}
                        className="p-1 text-emerald-400 hover:text-emerald-300"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-500 hover:text-slate-300"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group/title">
                      <span className="text-sm font-semibold text-slate-100 truncate">
                        {item.name}
                      </span>
                      <button
                        onClick={() => startRename(item)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-slate-300 transition-opacity p-0.5"
                        title="Döp om inspelning"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                    <span className="flex items-center gap-1 text-slate-400">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {formatTime(item.duration)}
                    </span>
                    <span>·</span>
                    <span>{formatFileSize(item.size || item.blob.size)}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1 text-slate-400">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {new Date(item.createdAt).toLocaleDateString('sv-SE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Zone: Actions */}
              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                <button
                  onClick={() => onPlayItem(item)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                  title="Öppna i stora redigerings- och vågformsspelaren"
                >
                  Öppna i spelare
                </button>

                <button
                  onClick={() => triggerDownload(item.blob, item.name)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-300 border border-rose-500/20 text-xs font-medium transition-colors"
                  title="Ladda ned MP3 till mappen Hämtade filer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Ladda ned</span>
                </button>

                <button
                  onClick={() => {
                    if (confirm(`Ta bort "${item.name}" från historiken?`)) {
                      onDeleteItem(item.id);
                    }
                  }}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                  title="Ta bort från lokal databas"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
