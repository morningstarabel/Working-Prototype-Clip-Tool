export type ProjectStatus =
  | "pending"
  | "downloading"
  | "transcribing"
  | "analyzing"
  | "rendering"
  | "completed"
  | "failed";

export type SourceType = "youtube" | "upload";

export interface Project {
  id: string;
  title: string | null;
  source_url: string | null;
  source_type: SourceType;
  created_at: string;
  status: ProjectStatus;
}

export interface ClipRow {
  id: string;
  project_id: string;
  start_time: number;
  end_time: number;
  title: string | null;
  hook: string | null;
  platform: string | null;
  viral_score: number | null;
  file_path: string | null;
  created_at: string;
}

export type Platform = "shorts" | "reels" | "tiktok";

export interface HookOptions {
  curiosity: string;
  bold: string;
  emotional: string;
}

export interface AnalyzedClip {
  start_time: number;
  end_time: number;
  platform: Platform[];
  hook_options: HookOptions;
  best_hook: string;
  caption_style: string;
  title: string;
  viral_score: number;
  score?: number;
  reasoning: string;
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  words?: TranscriptWord[];
}

export interface TranscriptSentence extends TranscriptSegment {
  words: TranscriptWord[];
}

export interface TranscriptData {
  text: string;
  segments: TranscriptSegment[];
  words: TranscriptWord[];
  sentences?: TranscriptSentence[];
  language?: string;
  duration?: number;
  /** True when using ffprobe-based placeholder instead of Whisper */
  placeholder?: boolean;
}

export interface ProjectMeta {
  id: string;
  title: string | null;
  sourceUrl: string | null;
  sourceType: SourceType;
  sourceFilename?: string;
  createdAt: string;
  status: ProjectStatus;
  error?: string;
}

export interface ProgressEvent {
  step: string;
  message: string;
  progress?: number;
  clipIndex?: number;
  clipTotal?: number;
}
