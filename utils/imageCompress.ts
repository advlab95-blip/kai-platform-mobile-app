/**
 * imageCompress — single-entry image compression helper.
 *
 * When to use:
 *   Call this BEFORE any user-picked image hits the network (Bunny Storage,
 *   Supabase Storage, edge function uploads). A typical iPhone 13/14 photo is
 *   5–10 MB; after compression at quality 0.7 / maxWidth 1920 it lands around
 *   500 KB – 1 MB — roughly an 80–90% reduction in upload bytes and CDN
 *   bandwidth.
 *
 * Why a separate file from utils/imageCompression.ts:
 *   `imageCompression.ts` exposes presets (avatar/cover/stamp/gallery) used by
 *   already-wired call sites. This file exposes the generic primitive with the
 *   shape `compressImage(uri, opts?)` for new call sites and direct usage. It
 *   delegates to expo-image-manipulator and never throws — on failure the
 *   original uri is returned so the upload still proceeds.
 *
 * Notes:
 *   - Remote URIs (http/https) are returned unchanged; we only compress local
 *     file:// or content:// URIs from the picker / camera.
 *   - Videos are out of scope here — pass them through as-is. Video transcode
 *     belongs in a dedicated pipeline (Bunny Stream handles its own encoding).
 *   - Aspect ratio is preserved by passing only `width` to the resize action;
 *     ImageManipulator scales height proportionally.
 */
import * as ImageManipulator from 'expo-image-manipulator';

export interface CompressImageOptions {
  /** JPEG quality, 0–1. Default 0.7 — visually identical to source for photos. */
  quality?: number;
  /** Max width in px; height scales to preserve aspect ratio. Default 1920. */
  maxWidth?: number;
  /** Output format. Default 'jpeg' (smaller files; lossy). */
  format?: 'jpeg' | 'png';
}

/**
 * Compress and resize a local image URI for upload.
 *
 * @param uri  Local file URI (file:// / content:// / ph://). Remote URLs are
 *             returned unchanged.
 * @param opts Optional override of quality / maxWidth / format.
 * @returns    A new local URI pointing at the compressed image, or the original
 *             URI if compression was skipped or failed.
 */
export async function compressImage(
  uri: string,
  opts: CompressImageOptions = {},
): Promise<string> {
  // Skip remote URLs — they're already on a CDN, nothing to compress locally.
  if (!uri || /^https?:\/\//i.test(uri)) {
    return uri;
  }

  const quality = opts.quality ?? 0.7;
  const maxWidth = opts.maxWidth ?? 1920;
  const format =
    opts.format === 'png'
      ? ImageManipulator.SaveFormat.PNG
      : ImageManipulator.SaveFormat.JPEG;

  try {
    // Passing only `width` preserves aspect ratio. We don't clamp height — the
    // 1920px width cap is enough to bring iPhone 12MP shots down to ~1 MB.
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format },
    );
    return result.uri;
  } catch {
    // Never throw — a failed compression must not block the upload. Worst case
    // we ship the original photo, which is the previous behavior anyway.
    return uri;
  }
}
