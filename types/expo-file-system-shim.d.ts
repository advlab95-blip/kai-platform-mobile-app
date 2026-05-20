// Module augmentation — expo-file-system 19.x moved the classic flat API behind a legacy
// submodule, but callers across the codebase still import from 'expo-file-system' and the
// functions resolve at runtime. This shim re-declares the legacy surface so TypeScript
// doesn't block the build during the SDK migration.
declare module 'expo-file-system' {
  export const documentDirectory: string | null;
  export const cacheDirectory: string | null;

  export interface FileInfo {
    exists: boolean;
    uri?: string;
    size?: number;
    isDirectory?: boolean;
    modificationTime?: number;
    md5?: string;
  }

  export interface DownloadResult {
    uri: string;
    status: number;
    headers: Record<string, string>;
    mimeType?: string | null;
  }

  export function getInfoAsync(
    fileUri: string,
    options?: { md5?: boolean; size?: boolean }
  ): Promise<FileInfo>;

  export function makeDirectoryAsync(
    fileUri: string,
    options?: { intermediates?: boolean }
  ): Promise<void>;

  export function deleteAsync(
    fileUri: string,
    options?: { idempotent?: boolean }
  ): Promise<void>;

  export function downloadAsync(
    uri: string,
    fileUri: string,
    options?: { md5?: boolean; headers?: Record<string, string> }
  ): Promise<DownloadResult>;

  export function readAsStringAsync(
    fileUri: string,
    options?: { encoding?: 'utf8' | 'base64' | string; position?: number; length?: number }
  ): Promise<string>;

  export function writeAsStringAsync(
    fileUri: string,
    contents: string,
    options?: { encoding?: 'utf8' | 'base64' | string }
  ): Promise<void>;

  export function readDirectoryAsync(fileUri: string): Promise<string[]>;

  export function moveAsync(options: { from: string; to: string }): Promise<void>;
  export function copyAsync(options: { from: string; to: string }): Promise<void>;

  export interface DownloadProgressData {
    totalBytesWritten: number;
    totalBytesExpectedToWrite: number;
  }

  export interface DownloadResumable {
    downloadAsync(): Promise<DownloadResult | undefined>;
    pauseAsync(): Promise<any>;
    resumeAsync(): Promise<DownloadResult | undefined>;
    savable(): any;
  }

  export function createDownloadResumable(
    uri: string,
    fileUri: string,
    options?: { md5?: boolean; headers?: Record<string, string> },
    callback?: (data: DownloadProgressData) => void,
    resumeData?: string
  ): DownloadResumable;
}
