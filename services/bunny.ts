/**
 * Bunny CDN Services — client-side façade.
 *
 * Historical risk: previous versions shipped the Bunny Storage password and
 * Stream API key to every mobile build via EXPO_PUBLIC_* env vars. Decompiling
 * the APK = full read/write/delete on every institute's content. Fixed here
 * by routing all privileged operations (upload, delete, video create) through
 * Supabase Edge Functions that hold the keys server-side:
 *
 *   - `upload-media`   → Bunny Storage uploads (images, PDFs, audio)
 *   - `upload-video`   → Bunny Stream video create + upload
 *   - `delete-media`   → Bunny Storage delete + Bunny Stream delete
 *
 * The only values still exposed to clients are public CDN hostnames and the
 * Stream library ID used in iframe embed URLs — none of which grant write
 * access. They're kept in EXPO_PUBLIC_* for convenience.
 */

import { Platform } from 'react-native';
import { supabase } from './supabase';

// Public CDN hostnames — NOT secrets. Anyone with a CDN URL already has these.
const STREAM_CDN = process.env.EXPO_PUBLIC_BUNNY_STREAM_CDN || '';
const STREAM_LIBRARY_ID = process.env.EXPO_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
const STORAGE_CDN = process.env.EXPO_PUBLIC_BUNNY_STORAGE_CDN || '';

/**
 * Build a multipart FormData containing a file fetched from a local URI.
 *
 * React Native and web FormData behave differently for binary uploads:
 *   - RN: append `{ uri, name, type }` — the form-data polyfill streams the
 *     file via the URI without loading the entire blob into memory.
 *   - Web: that triple gets coerced to `[object Object]` and the server
 *     reads `missing_file`. We must fetch the URI into a Blob first and
 *     append it as a real File/Blob.
 *
 * Platform detection: Platform.OS === 'web' covers Expo web (browser) reliably.
 */
async function buildFileFormData(
  fileUri: string,
  fieldName: string,
  fileName: string,
  mimeType: string,
): Promise<FormData> {
  const fd = new FormData();
  const isWeb = Platform.OS === 'web';
  if (isWeb) {
    // Browser: pull the bytes and wrap them in a real Blob/File so the
    // multipart boundary the runtime writes contains a Content-Type and
    // filename header the edge function recognises as a file field.
    const blobResp = await fetch(fileUri);
    if (!blobResp.ok) throw new Error('فشل قراءة الملف للرفع');
    const blob = await blobResp.blob();
    // Re-wrap in a File so `name` ships in the Content-Disposition; some
    // hosts ignore filename for plain Blob and emit warnings.
    const fileObj = typeof File !== 'undefined'
      ? new File([blob], fileName, { type: mimeType || blob.type || 'application/octet-stream' })
      : blob;
    fd.append(fieldName, fileObj as any, fileName);
  } else {
    // React Native: trust the bridge to stream from the URI.
    fd.append(fieldName, {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }
  return fd;
}

function inferMime(ext: string): string {
  const e = ext.toLowerCase();
  if (['jpg', 'jpeg'].includes(e)) return 'image/jpeg';
  if (e === 'png') return 'image/png';
  if (e === 'webp') return 'image/webp';
  if (e === 'gif') return 'image/gif';
  if (e === 'heic') return 'image/heic';
  if (e === 'pdf') return 'application/pdf';
  if (e === 'mp3') return 'audio/mpeg';
  if (e === 'm4a') return 'audio/m4a';
  if (e === 'aac') return 'audio/aac';
  if (e === 'wav') return 'audio/wav';
  if (e === 'ogg') return 'audio/ogg';
  if (e === 'mp4') return 'video/mp4';
  if (e === 'mov') return 'video/quicktime';
  if (e === 'webm') return 'video/webm';
  return 'application/octet-stream';
}

async function invokeEdgeUpload(
  fileUri: string,
  folder: string,
  ext: string,
): Promise<{ url: string; path: string }> {
  const fileName = `upload.${ext}`;
  const form = await buildFileFormData(fileUri, 'file', fileName, inferMime(ext));
  form.append('folder', folder);
  form.append('ext', ext);

  // Use direct fetch (not supabase.functions.invoke) so we can surface the
  // exact server error message instead of the opaque "Edge Function returned
  // a non-2xx status code" the SDK produces when the body is consumed.
  const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('الجلسة منتهية — سجّل الدخول من جديد');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/upload-media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
      // Do NOT set Content-Type — fetch sets multipart boundary automatically
    },
    body: form as any,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body;
    try { const j = JSON.parse(body); detail = j.error || j.message || body; } catch { /* keep raw */ }
    throw new Error(`upload failed (${res.status}): ${String(detail).slice(0, 200)}`);
  }
  const data = await res.json().catch(() => null);
  if (!data?.url) throw new Error('upload_failed: no url in response');
  return { url: data.url, path: data.path };
}

// ═══════════════════════════════════════════
// Bunny Stream (video)
// ═══════════════════════════════════════════
export const bunnyStream = {
  /**
   * Create video on Bunny Stream. The edge function handles both the create
   * call and the binary upload in one round-trip; the old 2-step API is kept
   * as separate methods but both now route to the same function.
   *
   * Call pattern from the UI:
   *   const { videoId } = await bunnyStream.createAndUpload(title, fileUri);
   *
   * Or, if the UI wants to stage a placeholder row before upload completes:
   *   use uploadVideo(title, fileUri) which returns { videoId }.
   */
  async createAndUpload(title: string, fileUri: string): Promise<{ videoId: string }> {
    const ext = (fileUri.split('.').pop() || 'mp4').toLowerCase();
    const fileName = `video.${ext}`;
    const form = await buildFileFormData(fileUri, 'file', fileName, inferMime(ext));
    form.append('title', title);
    const { data, error } = await supabase.functions.invoke('upload-video', {
      body: form,
    });
    if (error) throw new Error(error.message || 'video_upload_failed');
    if (!data?.videoId) throw new Error('video_upload_failed');
    return { videoId: data.videoId };
  },

  /** Back-compat shim: some callers invoke create + upload separately. */
  async createVideo(_title: string): Promise<{ videoId: string }> {
    // Defer the real work to uploadVideo — we no longer split the two steps.
    // Callers that expect a GUID before having the file should migrate to
    // createAndUpload; this shim throws to surface the issue.
    throw new Error('createVideo is deprecated — call bunnyStream.createAndUpload(title, fileUri) instead');
  },

  async uploadVideo(title: string, fileUri: string): Promise<{ videoId: string }> {
    return this.createAndUpload(title, fileUri);
  },

  async deleteVideo(videoId: string): Promise<void> {
    if (!videoId || videoId.startsWith('local_')) return;
    const { error } = await supabase.functions.invoke('delete-media', {
      body: { type: 'stream', videoId },
    });
    if (error) throw new Error(error.message || 'delete_failed');
  },

  getPlayUrl(videoId: string): string {
    if (!videoId || videoId.startsWith('local_') || !STREAM_CDN) return '';
    // Bunny Stream serves two play URLs:
    //   • play.mp4         → requires the "MP4 Fallback" toggle in the library
    //                        settings to be enabled (off by default → 404 → the
    //                        "فشل تشغيل الفيديو" error users reported)
    //   • playlist.m3u8    → HLS, always available, native to expo-video
    // We use HLS so playback works regardless of the library's MP4 toggle.
    return `https://${STREAM_CDN}/${videoId}/playlist.m3u8`;
  },

  getThumbnailUrl(videoId: string): string {
    if (!videoId || videoId.startsWith('local_') || !STREAM_CDN) return '';
    return `https://${STREAM_CDN}/${videoId}/thumbnail.jpg`;
  },

  getEmbedUrl(videoId: string): string {
    if (!videoId || videoId.startsWith('local_') || !STREAM_LIBRARY_ID) return '';
    return `https://iframe.mediadelivery.net/embed/${STREAM_LIBRARY_ID}/${videoId}?autoplay=false`;
  },

  // `isConfigured` used to check for the presence of client-side keys. With
  // keys moved server-side we always return true — the edge function decides
  // at call time whether Stream is configured, and surfaces a clear error.
  isConfigured(): boolean {
    return true;
  },
};

// ═══════════════════════════════════════════
// Bunny Storage (image / PDF / audio)
// ═══════════════════════════════════════════
export const bunnyStorage = {
  /**
   * Upload an arbitrary file to a whitelisted folder. The edge function
   * rewrites the final path to `${caller_institute_id}/${folder}/<file>` so
   * tenant boundaries are enforced regardless of what `folder` the caller
   * passed — see supabase/functions/upload-media for the allowlist.
   *
   * The old signature took a full `remotePath` including a leaf filename;
   * callers now pass just the folder, and the server assigns a random filename.
   * This matches how every caller was using the function anyway.
   */
  async uploadFile(fileUri: string, folderOrPath: string): Promise<string> {
    // Back-compat: older callers pass full paths with tenant/user segments or
    // filenames, e.g. `voice/${instituteId}/${userId}/${ts}.m4a`. The edge
    // function allowlist is top-level ONLY and the server itself prepends
    // `${caller_institute_id}/` + assigns a random filename, so we must strip
    // everything down to the top-level bucket name (or the first two segments
    // for 2-part folders like `materials/covers`).
    const ALLOWED_TOP = new Set([
      'avatars', 'logos', 'stamps', 'signatures', 'voice', 'galleries', 'tasks',
      'pdf', 'certificates', 'events', 'behavior', 'library',
      'ads', 'announcements', 'cafeteria', 'class-chat',
    ]);
    const ALLOWED_TWO = new Set(['materials/covers', 'materials/files']);
    // Common aliases callers used historically — normalize to the allowed name.
    const ALIASES: Record<string, string> = { pdfs: 'pdf' };
    const raw = folderOrPath.split('/').filter(Boolean);
    const last = raw[raw.length - 1] || '';
    const hasExt = /\.[a-z0-9]+$/i.test(last);
    const pathSegs = hasExt ? raw.slice(0, -1) : raw;
    const ext = hasExt
      ? (last.split('.').pop() || 'bin').toLowerCase()
      : (fileUri.split('.').pop() || 'bin').toLowerCase();

    let folder = '';
    if (pathSegs.length >= 2 && ALLOWED_TWO.has(`${pathSegs[0]}/${pathSegs[1]}`)) {
      folder = `${pathSegs[0]}/${pathSegs[1]}`;
    } else if (pathSegs.length >= 1) {
      const first = pathSegs[0];
      folder = ALIASES[first] || first;
      if (!ALLOWED_TOP.has(folder)) folder = first; // let the server reject
    }

    const { url } = await invokeEdgeUpload(fileUri, folder, ext);
    return url;
  },

  async deleteFile(remotePath: string): Promise<void> {
    if (!remotePath) return;
    const { error } = await supabase.functions.invoke('delete-media', {
      body: { type: 'storage', path: remotePath },
    });
    if (error) throw new Error(error.message || 'delete_failed');
  },

  getPublicUrl(remotePath: string): string {
    if (!STORAGE_CDN) return '';
    return `https://${STORAGE_CDN}/${remotePath}`;
  },

  async uploadImage(fileUri: string, folder: string): Promise<string> {
    const ext = (fileUri.split('.').pop() || 'jpg').toLowerCase();
    const { url } = await invokeEdgeUpload(fileUri, folder, ext);
    return url;
  },

  async uploadPDF(fileUri: string, folder: string): Promise<string> {
    const { url } = await invokeEdgeUpload(fileUri, folder, 'pdf');
    return url;
  },

  // With keys moved server-side the client can always attempt an upload; the
  // edge function decides whether storage is configured and surfaces a clear
  // error if not.
  isConfigured(): boolean {
    return true;
  },
};

// ═══════════════════════════════════════════
// Backward compatibility — bunnyService alias
// ═══════════════════════════════════════════
export const bunnyService = {
  ...bunnyStream,
  uploadImage: bunnyStorage.uploadImage.bind(bunnyStorage),
  uploadPDF: bunnyStorage.uploadPDF.bind(bunnyStorage),
  getPublicUrl: bunnyStorage.getPublicUrl.bind(bunnyStorage),
};
