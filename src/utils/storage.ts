import JSZip from 'jszip';
import { sanitizeFilename, triggerDownload } from './audioEncoder';

export interface StoredRecording {
  id: string;
  name: string;
  blob: Blob;
  duration: number;
  createdAt: number; // ms timestamp
  size: number;
}

const DB_NAME = 'enkel_ljudinspelare_db';
const DB_VERSION = 1;
const STORE_NAME = 'recordings';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB stöds inte i denna webbläsare.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieves all stored recordings sorted by createdAt descending (newest first).
 */
export async function getAllRecordings(): Promise<StoredRecording[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const items: StoredRecording[] = request.result || [];
        items.sort((a, b) => b.createdAt - a.createdAt);
        resolve(items);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('Failed to load recordings from IndexedDB:', err);
    return [];
  }
}

/**
 * Saves a new or updated recording to IndexedDB.
 */
export async function saveRecordingToDB(recording: StoredRecording): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(recording);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a recording by ID.
 */
export async function deleteRecordingFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clears all recordings from the database.
 */
export async function clearAllRecordingsFromDB(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Estimates storage usage in bytes.
 */
export async function getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const est = await navigator.storage.estimate();
    return {
      usedBytes: est.usage || 0,
      quotaBytes: est.quota || 0,
    };
  }
  return { usedBytes: 0, quotaBytes: 0 };
}

/**
 * Packs all recordings into a single ZIP file and triggers client-side download.
 */
export async function exportAllRecordingsAsZip(
  recordings: StoredRecording[],
  onProgress?: (percent: number) => void
): Promise<void> {
  if (recordings.length === 0) return;

  const zip = new JSZip();
  const folder = zip.folder('ljudinspelningar') || zip;
  const nameCounts: Record<string, number> = {};

  for (const item of recordings) {
    let cleanName = sanitizeFilename(item.name || 'inspelning');
    if (nameCounts[cleanName]) {
      nameCounts[cleanName]++;
      const base = cleanName.replace(/\.mp3$/i, '');
      cleanName = `${base}_${nameCounts[cleanName]}.mp3`;
    } else {
      nameCounts[cleanName] = 1;
    }

    folder.file(cleanName, item.blob);
  }

  // Also include a summary README text file
  const readmeContent = `Enkel Ljudinspelare - Exporterade inspelningar
Datum: ${new Date().toLocaleString('sv-SE')}
Antal filer: ${recordings.length}

Filer:
${recordings
  .map(
    (r, i) =>
      `${i + 1}. ${sanitizeFilename(r.name)} (${(r.duration).toFixed(1)}s, ${new Date(
        r.createdAt
      ).toLocaleString('sv-SE')})`
  )
  .join('\n')}

All inspelning har utförts 100% lokalt i din webbläsare. GDPR-säkert.`;

  folder.file('README.txt', readmeContent);

  const zipBlob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      if (onProgress) {
        onProgress(Math.round(metadata.percent));
      }
    }
  );

  const zipName = `alla_inspelningar_${new Date().toISOString().slice(0, 10)}.zip`;
  triggerDownload(zipBlob, zipName);
}
