/**
 * Image compression before upload — saves 40-60% Bunny Storage bandwidth
 * Compresses images to reasonable size before uploading
 */
import * as ImageManipulator from 'expo-image-manipulator';

interface CompressOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0-1
}

export async function compressImage(
  uri: string,
  options: CompressOptions = {}
): Promise<string> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.7 } = options;

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    // Fallback: return original if compression fails
    return uri;
  }
}

// Preset for profile pictures (small)
export async function compressAvatar(uri: string): Promise<string> {
  return compressImage(uri, { maxWidth: 300, maxHeight: 300, quality: 0.6 });
}

// Preset for gallery images (medium)
export async function compressGalleryImage(uri: string): Promise<string> {
  return compressImage(uri, { maxWidth: 1200, maxHeight: 1200, quality: 0.7 });
}

// Preset for material covers (small)
export async function compressCover(uri: string): Promise<string> {
  return compressImage(uri, { maxWidth: 600, maxHeight: 600, quality: 0.6 });
}

// Preset for certificate stamps/signatures (tiny)
export async function compressStamp(uri: string): Promise<string> {
  return compressImage(uri, { maxWidth: 200, maxHeight: 200, quality: 0.8 });
}
