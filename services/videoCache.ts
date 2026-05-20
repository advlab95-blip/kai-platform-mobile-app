import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const CACHE_DIR = `${FileSystem.documentDirectory ?? ''}.video_cache/`;
const MAX_CACHE_SIZE_MB = 5000; // 5 GB
const CACHE_METADATA_KEY = '@video_cache_metadata';

type CacheMetadata = {
  [videoId: string]: {
    version: number;
    size: number;
    downloadedAt: number;
    lastAccessedAt: number;
    title: string;
  };
};

// Initialize cache directory
export async function initCacheDirectory() {
  try {
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    // Prevent videos from appearing in gallery (Android)
    if (Platform.OS === 'android') {
      await FileSystem.writeAsStringAsync(`${CACHE_DIR}.nomedia`, '');
    }
  } catch (err) { console.error('[VideoCache init]:', err); }
}

// Get local path for a video
export function getLocalVideoPath(videoId: string, version = 1): string {
  return `${CACHE_DIR}video_${videoId}_v${version}.mp4`;
}

// Check if video is cached locally
export async function isVideoCached(videoId: string, version = 1): Promise<boolean> {
  try {
    const path = getLocalVideoPath(videoId, version);
    const info = await FileSystem.getInfoAsync(path);
    return info.exists && (info.size || 0) > 0;
  } catch { return false; }
}

// Get cache metadata
async function getMetadata(): Promise<CacheMetadata> {
  try {
    const json = await AsyncStorage.getItem(CACHE_METADATA_KEY);
    return json ? JSON.parse(json) : {};
  } catch { return {}; }
}

async function saveMetadata(metadata: CacheMetadata) {
  await AsyncStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(metadata));
}

// Download video with progress tracking + resume support
export async function downloadVideo(
  videoId: string,
  remoteUrl: string,
  version: number,
  title: string,
  onProgress?: (progress: number) => void
): Promise<string> {
  const localPath = getLocalVideoPath(videoId, version);

  // Already cached
  if (await isVideoCached(videoId, version)) {
    await updateLastAccessed(videoId);
    return localPath;
  }

  // Ensure space
  await ensureCacheSpace();

  // Delete old versions
  await deleteOldVersions(videoId, version);

  // Download with progress
  const downloadResumable = FileSystem.createDownloadResumable(
    remoteUrl,
    localPath,
    {},
    (downloadProgress) => {
      const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
      onProgress?.(Math.round(progress * 100) / 100);
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result) throw new Error('فشل التحميل');

  // Update metadata
  const metadata = await getMetadata();
  const fileInfo = await FileSystem.getInfoAsync(localPath);
  metadata[videoId] = {
    version,
    size: (fileInfo.exists ? fileInfo.size : 0) || 0,
    downloadedAt: Date.now(),
    lastAccessedAt: Date.now(),
    title,
  };
  await saveMetadata(metadata);

  return localPath;
}

// Update last accessed time
export async function updateLastAccessed(videoId: string) {
  const metadata = await getMetadata();
  if (metadata[videoId]) {
    metadata[videoId].lastAccessedAt = Date.now();
    await saveMetadata(metadata);
  }
}

// Delete a specific video from cache
export async function deleteCachedVideo(videoId: string) {
  const metadata = await getMetadata();
  if (metadata[videoId]) {
    const path = getLocalVideoPath(videoId, metadata[videoId].version);
    await FileSystem.deleteAsync(path, { idempotent: true });
    delete metadata[videoId];
    await saveMetadata(metadata);
  }
}

// Delete old versions of same video
async function deleteOldVersions(videoId: string, currentVersion: number) {
  try {
    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    for (const file of files) {
      if (file.startsWith(`video_${videoId}_`) && !file.includes(`_v${currentVersion}.`)) {
        await FileSystem.deleteAsync(`${CACHE_DIR}${file}`, { idempotent: true });
      }
    }
  } catch { /* silent */ }
}

// Auto-cleanup: delete oldest videos when cache is full (LRU)
export async function ensureCacheSpace() {
  const metadata = await getMetadata();
  let totalSize = Object.values(metadata).reduce((sum, v) => sum + v.size, 0);
  const maxSize = MAX_CACHE_SIZE_MB * 1024 * 1024;

  if (totalSize <= maxSize) return;

  // Sort by lastAccessedAt (oldest first)
  const sorted = Object.entries(metadata)
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

  // Delete oldest until 80% capacity
  for (const [videoId] of sorted) {
    if (totalSize <= maxSize * 0.8) break;
    const entry = metadata[videoId];
    if (!entry) continue;
    totalSize -= entry.size;
    await deleteCachedVideo(videoId);
  }
}

// Cache statistics
export async function getCacheStats() {
  const metadata = await getMetadata();
  const videos = Object.values(metadata);
  const totalSize = videos.reduce((sum, v) => sum + v.size, 0);

  return {
    count: videos.length,
    totalSizeMB: Math.round(totalSize / (1024 * 1024) * 10) / 10,
    maxSizeMB: MAX_CACHE_SIZE_MB,
    usedPercent: Math.round((totalSize / (MAX_CACHE_SIZE_MB * 1024 * 1024)) * 100 * 10) / 10,
    videos: videos.map(v => ({ title: v.title, sizeMB: Math.round(v.size / (1024 * 1024) * 10) / 10 })),
  };
}

// Clear all cache
export async function clearAllVideoCache() {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    await AsyncStorage.removeItem(CACHE_METADATA_KEY);
    await initCacheDirectory();
  } catch (err) { console.error('[VideoCache clear]:', err); }
}

// Get video source — returns cached path or remote URL
export async function getVideoSource(videoId: string, remoteUrl: string, version = 1): Promise<{ uri: string; isLocal: boolean }> {
  if (await isVideoCached(videoId, version)) {
    await updateLastAccessed(videoId);
    return { uri: getLocalVideoPath(videoId, version), isLocal: true };
  }
  return { uri: remoteUrl, isLocal: false };
}
