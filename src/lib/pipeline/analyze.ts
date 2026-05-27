import { writeClipsJson, readJson } from "@/lib/fs";
import { projectTranscriptPath } from "@/lib/paths";
import type { AnalyzedClip, TranscriptData } from "@/types";
import {
  generateCandidates,
  MIN_CLIP_SEC,
  selectRankedClips,
  targetClipCount,
  toAnalyzedClip,
} from "./clip-scoring";

/**
 * Scores transcript windows and selects 10–20 diverse, non-overlapping clips.
 * Ranked by composite engagement / emotion / hook score (best first).
 */
export async function analyzeTranscript(
  projectId: string
): Promise<AnalyzedClip[]> {
  console.log(`[pipeline:${projectId}] analyze: scoring clip candidates`);

  const transcript =
    readJson<TranscriptData>(projectTranscriptPath(projectId)) ??
    (() => {
      throw new Error("transcript.json not found — run transcribe first");
    })();

  const duration = transcript.duration ?? 0;
  const wordCount = transcript.words?.length ?? 0;
  const sentenceCount = transcript.sentences?.length ?? 0;
  console.log(
    `[pipeline:${projectId}] analyze: transcript words=${wordCount}, sentences=${sentenceCount}, word timestamps enabled=${wordCount > 0}`
  );
  if (duration < MIN_CLIP_SEC) {
    throw new Error(
      `Video is too short (${duration.toFixed(1)}s). Need at least ${MIN_CLIP_SEC}s.`
    );
  }

  const target = targetClipCount(duration);
  console.log(
    `[pipeline:${projectId}] analyze: duration=${duration.toFixed(1)}s targetClips=${target}`
  );

  const candidates = generateCandidates(transcript, duration);
  console.log(
    `[pipeline:${projectId}] analyze: ${candidates.length} candidates after emotion-based scoring`
  );

  if (candidates.length === 0) {
    console.warn(
      `[pipeline:${projectId}] analyze: WARNING - no emotional clips found, will use segment-based fallback`
    );
  }

  const selected = selectRankedClips(candidates, duration);
  console.log(
    `[pipeline:${projectId}] analyze: selected ${selected.length} non-overlapping clips`
  );

  if (selected.length === 0) {
    throw new Error("No viable clips found after scoring");
  }

  const clips = selected.map((c, i) => toAnalyzedClip(c, i + 1));

  // Log all clips for detailed debugging
  console.log(`[pipeline:${projectId}] analyze: ALL ${clips.length} RANKED CLIPS:`);
  clips.forEach((clip, i) => {
    const duration = clip.end_time - clip.start_time;
    console.log(
      `  #${i + 1} | score=${clip.viral_score}/10 | ` +
        `${clip.start_time.toFixed(1)}s-${clip.end_time.toFixed(1)}s (${duration.toFixed(1)}s) | ` +
        `"${clip.best_hook}"`
    );
  });
  writeClipsJson(projectId, clips);
  console.log(
    `[pipeline:${projectId}] analyze: saved clips.json (${clips.length} ranked clips)`
  );

  return clips;
}
