import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { ArenaSong, ArenaSongChunk } from './types';

export const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
]);

// ~8.5 MiB hard ceiling (labelled "up to 8 MB" in UI)
export const MAX_SONG_SIZE_BYTES = 8912896;
// 450 KB binary slice -> ~600 KB base64 (safely below Firestore 1 MB document cap)
export const SONG_CHUNK_BINARY_BYTES = 450 * 1024;

export function resolveSupportedAudioMime(file: File): string | null {
  const rawType = (file.type || '').toLowerCase().split(';')[0].trim();
  if (rawType && ALLOWED_AUDIO_MIME_TYPES.has(rawType)) {
    return rawType;
  }
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.mp3')) return 'audio/mpeg';
  if (lowerName.endsWith('.m4a')) return 'audio/mp4';
  if (lowerName.endsWith('.wav')) return 'audio/wav';
  return null;
}

export function isSupportedAudioFile(file: File): boolean {
  return resolveSupportedAudioMime(file) !== null;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const sliceSize = 0x4000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += sliceSize) {
    const sub = bytes.subarray(i, Math.min(i + sliceSize, bytes.length));
    parts.push(String.fromCharCode(...sub));
  }
  return btoa(parts.join(''));
}

function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

// ==================== INDEXEDDB DEVICE AUDIO CACHE ====================
const IDB_NAME = 'nexus_ff_audio_cache';
const IDB_VERSION = 1;
const IDB_STORE = 'songs';

interface CachedSongRecord {
  id: string;
  revision: number;
  title: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  cachedAt: number;
}

function openAudioCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const database = req.result;
        if (!database.objectStoreNames.contains(IDB_STORE)) {
          database.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function getCachedSongRecord(songId: string): Promise<CachedSongRecord | null> {
  const database = await openAudioCacheDb();
  if (!database) return null;
  return new Promise((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(songId);
      req.onsuccess = () => resolve((req.result as CachedSongRecord | undefined) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function putCachedSongRecord(record: CachedSongRecord): Promise<void> {
  const database = await openAudioCacheDb();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function deleteCachedSongRecord(songId: string): Promise<void> {
  const database = await openAudioCacheDb();
  if (!database) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = database.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(songId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

// ==================== ADMIN CHUNK UPLOAD / REPLACE / DELETE ====================

export interface UploadSongOptions {
  file: File;
  title?: string;
  licenseConfirmed: boolean;
  setActive?: boolean;
  replaceSong?: ArenaSong;
  onProgress?: (pct: number, stage: string) => void;
}

export async function uploadSongToFirestore({
  file,
  title,
  licenseConfirmed,
  setActive = false,
  replaceSong,
  onProgress,
}: UploadSongOptions): Promise<ArenaSong> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in as Owner Admin before uploading songs.');
  }

  const mimeType = resolveSupportedAudioMime(file);
  if (!mimeType) {
    throw new Error('Unsupported format. Please select an MP3, M4A, or WAV audio file.');
  }

  if (file.size <= 0) {
    throw new Error('Selected audio file is empty.');
  }

  if (file.size > MAX_SONG_SIZE_BYTES) {
    throw new Error(
      `File is ${(file.size / (1024 * 1024)).toFixed(2)} MB. Maximum supported song size is 8 MB.`,
    );
  }

  onProgress?.(5, 'Reading original audio bytes...');
  const rawBuffer = await file.arrayBuffer();
  const rawBytes = new Uint8Array(rawBuffer);
  const chunkCount = Math.max(1, Math.ceil(rawBytes.length / SONG_CHUNK_BINARY_BYTES));

  if (chunkCount > 25) {
    throw new Error('Song exceeds maximum chunk count (25). Please keep files up to 8 MB.');
  }

  const songId = replaceSong ? replaceSong.id : `song_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const cleanTitle = (title || replaceSong?.title || file.name.replace(/\.[^.]+$/, '')).trim().slice(0, 140) || 'Arena Track';
  const cleanFileName = file.name.trim().slice(0, 180) || 'track';
  const nextRevision = replaceSong ? (replaceSong.revision || 1) + 1 : 1;

  // Step 1: Ensure parent song metadata exists (chunks rules check exists(songs/{songId}))
  if (!replaceSong) {
    await setDoc(doc(db, 'songs', songId), {
      id: songId,
      title: cleanTitle,
      fileName: cleanFileName,
      mimeType,
      sizeBytes: rawBytes.length,
      chunkCount,
      active: false,
      licenseConfirmed,
      revision: nextRevision,
      uploadedBy: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  // Step 2: Upload exact unmodified binary slices sequentially (or small batches)
  for (let i = 0; i < chunkCount; i++) {
    const start = i * SONG_CHUNK_BINARY_BYTES;
    const end = Math.min(start + SONG_CHUNK_BINARY_BYTES, rawBytes.length);
    const slice = rawBytes.subarray(start, end);
    const dataBase64 = uint8ToBase64(slice);

    const chunkDoc: ArenaSongChunk = {
      songId,
      index: i,
      dataBase64,
      sizeBytes: slice.length,
    };

    await setDoc(doc(db, 'songs', songId, 'chunks', `chunk_${i}`), chunkDoc);
    const pct = Math.min(92, Math.round(10 + ((i + 1) / chunkCount) * 82));
    onProgress?.(pct, `Uploading audio chunk ${i + 1} of ${chunkCount}...`);
  }

  // Step 3: If replacing an existing song that previously had more chunks, remove trailing old chunks
  if (replaceSong) {
    const oldChunksSnap = await getDocs(collection(db, 'songs', songId, 'chunks'));
    const deletions = oldChunksSnap.docs.filter((d) => {
      const idx = (d.data() as { index?: number }).index ?? -1;
      return idx >= chunkCount || idx < 0;
    });
    for (const stale of deletions) {
      await deleteDoc(stale.ref);
    }

    await updateDoc(doc(db, 'songs', songId), {
      title: cleanTitle,
      fileName: cleanFileName,
      mimeType,
      sizeBytes: rawBytes.length,
      chunkCount,
      licenseConfirmed,
      revision: nextRevision,
      uploadedBy: user.uid,
      updatedAt: serverTimestamp(),
    });

    await deleteCachedSongRecord(songId);
  }

  onProgress?.(96, 'Finalizing song configuration...');

  const shouldBeActive = setActive || Boolean(replaceSong?.active);
  if (shouldBeActive) {
    await activateSongInFirestore(songId, {
      title: cleanTitle,
      licenseConfirmed,
      revision: nextRevision,
    });
  }

  onProgress?.(100, 'Song saved without re-encoding.');

  return {
    id: songId,
    title: cleanTitle,
    fileName: cleanFileName,
    mimeType,
    sizeBytes: rawBytes.length,
    chunkCount,
    active: shouldBeActive,
    licenseConfirmed,
    revision: nextRevision,
    uploadedBy: user.uid,
  };
}

export async function activateSongInFirestore(
  songId: string,
  overrideMeta?: { title?: string; licenseConfirmed?: boolean; revision?: number },
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Owner session required.');

  const targetSnap = await getDoc(doc(db, 'songs', songId));
  if (!targetSnap.exists()) {
    throw new Error('Selected song does not exist.');
  }
  const targetSong = targetSnap.data() as ArenaSong;

  const activeSnap = await getDocs(query(collection(db, 'songs'), where('active', '==', true)));
  const batch = writeBatch(db);

  for (const d of activeSnap.docs) {
    if (d.id !== songId) {
      batch.update(d.ref, { active: false, updatedAt: serverTimestamp() });
    }
  }

  batch.update(doc(db, 'songs', songId), {
    active: true,
    updatedAt: serverTimestamp(),
  });

  batch.set(doc(db, 'appSettings', 'music'), {
    id: 'music',
    activeSongId: songId,
    trackTitle: overrideMeta?.title || targetSong.title,
    audioUrl: '/audio/arena-theme.m4a',
    revision: overrideMeta?.revision ?? targetSong.revision ?? 1,
    licenseConfirmed: overrideMeta?.licenseConfirmed ?? Boolean(targetSong.licenseConfirmed),
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function switchToBundledDefaultSong(trackTitle: string, licenseConfirmed: boolean): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Owner session required.');

  const activeSnap = await getDocs(query(collection(db, 'songs'), where('active', '==', true)));
  const batch = writeBatch(db);
  for (const d of activeSnap.docs) {
    batch.update(d.ref, { active: false, updatedAt: serverTimestamp() });
  }
  batch.set(doc(db, 'appSettings', 'music'), {
    id: 'music',
    activeSongId: '',
    trackTitle: trackTitle.trim() || 'Arena Theme (Bundled)',
    audioUrl: '/audio/arena-theme.m4a',
    revision: 0,
    licenseConfirmed,
    updatedBy: user.uid,
    updatedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function deleteSongFromFirestore(song: ArenaSong): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Owner session required.');

  const chunksSnap = await getDocs(collection(db, 'songs', song.id, 'chunks'));
  // Delete chunks in batches of 400
  for (let i = 0; i < chunksSnap.docs.length; i += 400) {
    const batch = writeBatch(db);
    chunksSnap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }

  await deleteDoc(doc(db, 'songs', song.id));
  await deleteCachedSongRecord(song.id);

  if (song.active) {
    await setDoc(doc(db, 'appSettings', 'music'), {
      id: 'music',
      activeSongId: '',
      trackTitle: 'Riogeovn - AINSI BAS LA VIDA (Super Slowed) HARDTEKK PHONK MUSIC',
      audioUrl: '/audio/arena-theme.m4a',
      revision: 0,
      licenseConfirmed: true,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    });
  }
}

// ==================== PLAYER REASSEMBLY + DEVICE CACHE ====================

export interface LoadedSongResult {
  objectUrl: string;
  title: string;
  mimeType: string;
  fromCache: boolean;
}

const inflightSongLoads = new Map<string, Promise<LoadedSongResult>>();

export async function loadSongObjectUrl(
  songId: string,
  expectedRevision?: number,
): Promise<LoadedSongResult> {
  const inflightKey = `${songId}:${expectedRevision ?? 'latest'}`;
  const existingPromise = inflightSongLoads.get(inflightKey);
  if (existingPromise) return existingPromise;

  const task = (async (): Promise<LoadedSongResult> => {
    // 1. Check local IndexedDB cache first
    const cached = await getCachedSongRecord(songId);
    if (
      cached &&
      cached.blob instanceof Blob &&
      cached.blob.size > 0 &&
      (!expectedRevision || cached.revision === expectedRevision)
    ) {
      return {
        objectUrl: URL.createObjectURL(cached.blob),
        title: cached.title,
        mimeType: cached.mimeType,
        fromCache: true,
      };
    }

    // 2. Fetch song metadata & ordered raw chunks from Firestore
    const songSnap = await getDoc(doc(db, 'songs', songId));
    if (!songSnap.exists()) {
      throw new Error('Active song document not found.');
    }
    const song = songSnap.data() as ArenaSong;

    // If expectedRevision wasn't passed, re-check cache against fetched song.revision
    if (!expectedRevision && cached && cached.revision === song.revision && cached.blob instanceof Blob) {
      return {
        objectUrl: URL.createObjectURL(cached.blob),
        title: cached.title,
        mimeType: cached.mimeType,
        fromCache: true,
      };
    }

    const chunksSnap = await getDocs(collection(db, 'songs', songId, 'chunks'));
    const sortedChunks = chunksSnap.docs
      .map((d) => d.data() as ArenaSongChunk)
      .sort((a, b) => a.index - b.index);

    if (sortedChunks.length === 0) {
      throw new Error('Song audio chunks are missing.');
    }

    const byteParts: BlobPart[] = sortedChunks.map((chunk) => {
      const bytes = base64ToUint8(chunk.dataBase64);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      return copy.buffer;
    });
    const exactBlob = new Blob(byteParts, { type: song.mimeType || 'audio/mpeg' });

    await putCachedSongRecord({
      id: song.id,
      revision: song.revision || 1,
      title: song.title,
      mimeType: song.mimeType || 'audio/mpeg',
      sizeBytes: exactBlob.size,
      blob: exactBlob,
      cachedAt: Date.now(),
    });

    return {
      objectUrl: URL.createObjectURL(exactBlob),
      title: song.title,
      mimeType: song.mimeType || 'audio/mpeg',
      fromCache: false,
    };
  })().finally(() => {
    inflightSongLoads.delete(inflightKey);
  });

  inflightSongLoads.set(inflightKey, task);
  return task;
}
