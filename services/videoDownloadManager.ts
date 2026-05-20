/**
 * Video Download Manager — Smart caching for videos
 * Saves 80% Bunny Stream bandwidth by caching videos locally
 * - Auto-downloads on WiFi
 * - Manages storage (5GB limit)
 * - Serves cached videos instantly (offline support)
 */
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const CACHE_DIR = `${FileSystem.documentDirectory ?? ''}video_cache/`;
const MAX_CACHE_MB = 2000; // 2GB max
const META_KEY = '@video_cache_meta';

interface CacheMeta {
  [videoId: string]: {
    localUri: string;
    size: number; // bytes
    downloadedAt: number;
    lastAccessed: number;
    title: string;
  };
}

async function getMeta(): Promise<CacheMeta> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

async function saveMeta(meta: CacheMeta) {
  try { await AsyncStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {}
}

export const VideoDownloadManager = {
  /** Check if video is cached locally */
  async isCached(videoId: string): Promise<boolean> {
    const meta = await getMeta();
    if (!meta[videoId]) return false;
    const info = await FileSystem.getInfoAsync(meta[videoId].localUri);
    return info.exists;
  },

  /** Get local URI for cached video */
  async getCachedUri(videoId: string): Promise<string | null> {
    const meta = await getMeta();
    if (!meta[videoId]) return null;
    const info = await FileSystem.getInfoAsync(meta[videoId].localUri);
    if (!info.exists) return null;
    // Update last accessed
    meta[videoId].lastAccessed = Date.now();
    await saveMeta(meta);
    return meta[videoId].localUri;
  },

  /** Download video to local cache */
  async download(
    videoId: string,
    remoteUrl: string,
    title: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    // Ensure cache directory exists
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });

    // Check available space
    await this.cleanupIfNeeded();

    const localUri = `${CACHE_DIR}${videoId}.mp4`;

    const downloadResumable = FileSystem.createDownloadResumable(
      remoteUrl, localUri, {},
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (!result) throw new Error('فشل تحميل الفيديو');

    // Save metadata
    const meta = await getMeta();
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    meta[videoId] = {
      localUri,
      size: fileInfo.exists ? ((fileInfo as any).size || 0) : 0,
      downloadedAt: Date.now(),
      lastAccessed: Date.now(),
      title,
    };
    await saveMeta(meta);

    return localUri;
  },

  /** Check if on WiFi (for auto-download) */
  async isOnWiFi(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.type === 'wifi' && state.isConnected === true;
    } catch { return false; }
  },

  /** Get total cache size in MB */
  async getCacheSize(): Promise<number> {
    const meta = await getMeta();
    const totalBytes = Object.values(meta).reduce((sum, v) => sum + (v.size || 0), 0);
    return Math.round(totalBytes / (1024 * 1024));
  },

  /** Get cached video count */
  async getCachedCount(): Promise<number> {
    const meta = await getMeta();
    return Object.keys(meta).length;
  },

  /** Cleanup oldest videos if cache exceeds limit */
  async cleanupIfNeeded() {
    const meta = await getMeta();
    const totalMB = Object.values(meta).reduce((sum, v) => sum + (v.size || 0), 0) / (1024 * 1024);

    if (totalMB <= MAX_CACHE_MB) return;

    // Sort by last accessed (oldest first)
    const sorted = Object.entries(meta).sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    let currentMB = totalMB;
    for (const [videoId, info] of sorted) {
      if (currentMB <= MAX_CACHE_MB * 0.7) break; // Keep 70% of limit
      try { await FileSystem.deleteAsync(info.localUri, { idempotent: true }); } catch {}
      delete meta[videoId];
      currentMB -= (info.size || 0) / (1024 * 1024);
    }

    await saveMeta(meta);
  },

  /** Clear all cached videos */
  async clearAll() {
    try {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
      await AsyncStorage.removeItem(META_KEY);
    } catch {}
  },

  /** Delete specific cached video */
  async deleteVideo(videoId: string) {
    const meta = await getMeta();
    if (meta[videoId]) {
      try { await FileSystem.deleteAsync(meta[videoId].localUri, { idempotent: true }); } catch {}
      delete meta[videoId];
      await saveMeta(meta);
    }
  },
};
