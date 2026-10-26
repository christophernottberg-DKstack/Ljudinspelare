import React from 'react';
import { Download, Trash2, FileAudio, Play } from 'lucide-react';
import { formatTime, formatFileSize, triggerDownload } from '../utils/audioEncoder';

export interface SavedRecordingItem {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
  createdAt: Date;
}

interface RecordingHistoryProps {
  items: SavedRecordingItem[];
  onPlayItem: (item: SavedRecordingItem) => void;
  onDeleteItem: (id: string) => void;
  onClearAll: () => void;
}

export const RecordingHistory: React.FC<RecordingHistoryProps> = ({
  items,
  onPlayItem,
  onDeleteItem,
  onClearAll,
}) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="w-full mt-6 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <FileAudio className="w-4 h-4 text-rose-400" />
          <span>Tidigare inspelningar ({items.length})</span>
        </h3>
        {items.length > 1 && (
          <button
            onClick={onClearAll}
            className="text-xs text-slate-400 hover:text-rose-400 transition-colors"
          >
            Rensa alla
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between p-3.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700/80 transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => onPlayItem(item)}
                className="w-9 h-9 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors shrink-0"
                title="Lyssna"
              >
                <Play className="w-4 h-4 fill-current ml-0.5" />
              </button>

              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-slate-200 truncate">
                  {item.name}
                </span>
                <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                  <span>{formatTime(item.duration)}</span>
                  <span>·</span>
                  <span>{formatFileSize(item.blob.size)}</span>
                  <span>·</span>
                  <span>
                    {item.createdAt.toLocaleTimeString('sv-SE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => triggerDownload(item.blob, item.name)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium transition-colors"
                title="Ladda ner MP3 till Hämtade filer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Ladda ner</span>
              </button>

              <button
                onClick={() => onDeleteItem(item.id)}
                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                title="Ta bort från lista"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
