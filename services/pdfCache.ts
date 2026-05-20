/**
 * PDF Cache — Download PDFs once, serve from device
 * Saves bandwidth when student opens same PDF multiple times
 */
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_DIR = `${FileSystem.documentDirectory ?? ''}pdf_cache/`;
const META_KEY = '@pdf_cache_meta';
const MAX_CACHE_MB = 500; // 500MB max for PDFs

interface PdfMeta {
  [url: string]: { localUri: string; size: number; cachedAt: number; title: string };
}

async function getMeta(): Promise<PdfMeta> {
  try { const r = await AsyncStorage.getItem(META_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
async function saveMeta(m: PdfMeta) {
  try { await AsyncStorage.setItem(META_KEY, JSON.stringify(m)); } catch {}
}

export const PdfCache = {
  async getCachedUri(remoteUrl: string): Promise<string | null> {
    const meta = await getMeta();
    const entry = meta[remoteUrl];
    if (!entry) return null;
    const info = await FileSystem.getInfoAsync(entry.localUri);
    if (!info.exists) { delete meta[remoteUrl]; await saveMeta(meta); return null; }
    return entry.localUri;
  },

  async download(remoteUrl: string, title?: string): Promise<string> {
    // Check cache first
    const cached = await this.getCachedUri(remoteUrl);
    if (cached) return cached;

    // Ensure dir
    const dirInfo = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });

    // Cleanup if needed
    await this.cleanup();

    const fileName = remoteUrl.split('/').pop() || `pdf_${Date.now()}.pdf`;
    const localUri = CACHE_DIR + fileName;
    const result = await FileSystem.downloadAsync(remoteUrl, localUri);
    if (!result) throw new Error('فشل تحميل PDF');

    const meta = await getMeta();
    const fileInfo = await FileSystem.getInfoAsync(localUri);
    meta[remoteUrl] = { localUri, size: fileInfo.exists ? ((fileInfo as any).size || 0) : 0, cachedAt: Date.now(), title: title || fileName };
    await saveMeta(meta);

    return localUri;
  },

  async cleanup() {
    const meta = await getMeta();
    const totalMB = Object.values(meta).reduce((s, v) => s + (v.size || 0), 0) / (1024 * 1024);
    if (totalMB <= MAX_CACHE_MB) return;
    const sorted = Object.entries(meta).sort(([, a], [, b]) => a.cachedAt - b.cachedAt);
    let current = totalMB;
    for (const [url, info] of sorted) {
      if (current <= MAX_CACHE_MB * 0.7) break;
      try { await FileSystem.deleteAsync(info.localUri, { idempotent: true }); } catch {}
      delete meta[url];
      current -= (info.size || 0) / (1024 * 1024);
    }
    await saveMeta(meta);
  },

  async clearAll() {
    try { await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true }); } catch {}
    await AsyncStorage.removeItem(META_KEY);
  },

  async getStats(): Promise<{ count: number; sizeMB: number }> {
    const meta = await getMeta();
    const entries = Object.values(meta);
    return { count: entries.length, sizeMB: Math.round(entries.reduce((s, v) => s + (v.size || 0), 0) / (1024 * 1024)) };
  },
};
