import { ALLOWED_UPLOAD_TYPES } from "@/lib/constants";
import { parseYouTubeUrl } from "@/lib/youtube-url";

export function isValidYouTubeUrl(url: string): boolean {
  return parseYouTubeUrl(url) !== null;
}

export function normalizeYouTubeUrl(url: string): string | null {
  return parseYouTubeUrl(url);
}

export function isAllowedVideoFile(file: File): boolean {
  return (
    ALLOWED_UPLOAD_TYPES.includes(file.type) ||
    /\.(mp4|mov|m4v)$/i.test(file.name)
  );
}
