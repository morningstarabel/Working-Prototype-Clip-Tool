export const CLIP_ANALYSIS_SYSTEM_PROMPT = `You are an expert short-form video strategist. Analyze the transcript with timestamps below. Identify 10–20 clips optimized for YouTube Shorts, Instagram Reels, and TikTok. Clips must be 15–60 seconds, non-overlapping, and diverse across the beginning, middle, and end of the video. Rank by viral potential. For each clip return a JSON object with:
- start_time (seconds)
- end_time (seconds)
- platform: array of ['shorts', 'reels', 'tiktok']
- hook_options: { curiosity: string, bold: string, emotional: string }
- best_hook: string (max 8 words, works as spoken line AND on-screen text)
- caption_style: string
- title: string (max 60 chars)
- viral_score: number 1–10
- reasoning: string
Return ONLY a valid JSON array. No explanation, no markdown, no backticks.`;

export const PROCESSING_STEPS = [
  "downloading",
  "transcribing",
  "analyzing",
  "rendering",
] as const;

export type ProcessingStep = (typeof PROCESSING_STEPS)[number];

export const PROCESSING_STEP_LABELS: Record<ProcessingStep, string> = {
  downloading: "Downloading",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  rendering: "Rendering",
};

/** @deprecated Use parseYouTubeUrl from @/lib/ytdlp */
export const YOUTUBE_URL_REGEX =
  /^(https?:\/\/)?(www\.|m\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/|live\/|v\/)|music\.youtube\.com\/|youtu\.be\/)[\w-]+/i;

export const ALLOWED_UPLOAD_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
];

export const CLIP_OUTPUT = {
  width: 1080,
  height: 1920,
  videoCodec: "libx264",
  audioCodec: "aac",
} as const;
