// FORCE CHECK - ganz oben
console.log('========== ENV CHECK ==========');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('Has OPENAI_API_KEY?', !!process.env.OPENAI_API_KEY);
console.log('First 5 chars:', process.env.OPENAI_API_KEY?.substring(0, 5));
console.log('Has ANTHROPIC?', !!process.env.ANTHROPIC_API_KEY);
console.log('================================');







import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import OpenAI from "openai";
import { getVideoDuration } from "@/lib/ffmpeg";
import { writeTranscript } from "@/lib/fs";
import { projectDir } from "@/lib/paths";
import type {
  TranscriptData,
  TranscriptSegment,
  TranscriptSentence,
  TranscriptWord,
} from "@/types";

const execFileAsync = promisify(execFile);
const FFMPEG_PATH = process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const SILENCE_BREAK_THRESHOLD = 0.75;

function normalizeTokenText(token: string): string {
  return token.replace(/\s+/g, " ").trim();
}

function formatAssFriendlyText(words: string[]): string {
  return words.reduce((memo, token) => {
    const trimmed = token.trim();
    if (!memo) return trimmed;

    if (/^[.,!?;:\)\]\"]+$/.test(trimmed)) {
      return `${memo}${trimmed}`;
    }

    if (/^[\"'`“”‘¿¡]/.test(trimmed)) {
      return `${memo}${trimmed}`;
    }

    return `${memo} ${trimmed}`;
  }, "");
}

function parseWordToken(raw: unknown): TranscriptWord | null {
  const entry = raw as Record<string, unknown>;
  const word = String(entry.word ?? entry.text ?? "").trim();
  const start = Number(entry.start ?? entry.timestamp ?? 0);
  const end = Number(entry.end ?? 0);

  if (!word) return null;
  return {
    word,
    start: Number.isNaN(start) ? 0 : start,
    end: Number.isNaN(end) ? start : end,
  };
}

function buildSentenceGroups(words: TranscriptWord[]): TranscriptSentence[] {
  const sentences: TranscriptSentence[] = [];
  const currentWords: TranscriptWord[] = [];

  const flushSentence = () => {
    if (currentWords.length === 0) return;
    sentences.push({
      id: sentences.length,
      start: currentWords[0].start,
      end: currentWords[currentWords.length - 1].end,
      text: formatAssFriendlyText(currentWords.map((word) => word.word)),
      words: [...currentWords],
    });
    currentWords.length = 0;
  };

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const previous = words[i - 1];

    if (
      previous &&
      word.start - previous.end >= SILENCE_BREAK_THRESHOLD &&
      currentWords.length > 0
    ) {
      flushSentence();
    }

    currentWords.push(word);

    if (/[.!?]$/.test(word.word.trim())) {
      flushSentence();
    }
  }

  flushSentence();
  return sentences;
}

async function extractAudio(videoPath: string, audioPath: string): Promise<void> {
  await execFileAsync(FFMPEG_PATH, [
    "-y",
    "-i",
    videoPath,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "16000",
    "-ac",
    "1",
    audioPath,
  ]);
}

async function transcribeWithWhisper(
  projectId: string,
  videoPath: string
): Promise<TranscriptData> {
  const audioPath = path.join(projectDir(projectId), "audio.wav");
  console.log(`[transcribe:${projectId}] extracting audio to ${audioPath}`);
  await extractAudio(videoPath, audioPath);

  const apiKey = process.env.OPENAI_API_KEY;
  const apiKeyMasked = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}` : "MISSING";
  console.log(`[transcribe:${projectId}] OPENAI_API_KEY status: ${apiKeyMasked}`);
  
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for Whisper transcription");
  }

  console.log(`[transcribe:${projectId}] initializing OpenAI client`);
  const client = new OpenAI({ apiKey });
  console.log(`[transcribe:${projectId}] calling Whisper transcription API`);
  
  const response = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath),
    model: "whisper-1",
    response_format: "verbose_json",
    temperature: 0,
  });

  console.log(`[transcribe:${projectId}] Whisper response received`);
  const raw = response as unknown as Record<string, unknown>;
  const text = String(raw.text ?? "").trim();
  const rawSegments = Array.isArray(raw.segments) ? raw.segments : [];
  const segments: TranscriptSegment[] = rawSegments.map((rawSegment, index) => {
    const entry = rawSegment as Record<string, unknown>;
    const words = Array.isArray(entry.words)
      ? entry.words
          .map(parseWordToken)
          .filter((word): word is TranscriptWord => word !== null)
      : [];

    const segmentText = String(entry.text ?? formatAssFriendlyText(words.map((word) => word.word)) ?? "").trim();
    const start = Number(entry.start ?? words[0]?.start ?? 0);
    const end = Number(entry.end ?? words[words.length - 1]?.end ?? 0);

    return {
      id: index,
      start: Number.isNaN(start) ? 0 : start,
      end: Number.isNaN(end) ? 0 : end,
      text: normalizeTokenText(segmentText),
      words,
    };
  });

  const words = segments.flatMap((segment) => segment.words ?? []);
  const sentences = buildSentenceGroups(words);
  const duration = await getVideoDuration(videoPath);

  const transcript: TranscriptData = {
    text: normalizeTokenText(text || segments.map((segment) => segment.text).join(" ")),
    segments: segments.length > 0 ? segments : [{ id: 0, start: 0, end: duration, text, words }],
    words,
    sentences,
    language: "en",
    duration,
    placeholder: false,
  };

  console.log(`[transcribe:${projectId}] TRANSCRIPT BUILD COMPLETE:`);
  console.log(JSON.stringify(transcript, null, 2));
  console.log(`[transcribe:${projectId}] transcript summary: text_length=${transcript.text.length}, segments=${transcript.segments.length}, words=${transcript.words.length}, sentences=${transcript.sentences?.length ?? 0}`);

  return transcript;
}

export async function transcribeVideo(
  projectId: string,
  videoPath: string
): Promise<TranscriptData> {
  // Debug: show whether OPENAI_API_KEY is present (first 10 chars only)
  const _openaiKeyPreview = process.env.OPENAI_API_KEY
    ? `${process.env.OPENAI_API_KEY.slice(0, 10)}`
    : "MISSING";
  console.log(
    `[pipeline:${projectId}] transcribe: OPENAI_API_KEY present=${!!process.env.OPENAI_API_KEY} preview=${_openaiKeyPreview}`
  );

  console.log(`[pipeline:${projectId}] transcribe: starting Whisper transcription`);

  try {
    const transcript = await transcribeWithWhisper(projectId, videoPath);
    const hasWordTimestamps = transcript.words.length > 0;

    writeTranscript(projectId, transcript);

    console.log(
      `[pipeline:${projectId}] transcribe: saved transcript.json (${transcript.segments.length} segments, ${transcript.words.length} words, ${transcript.sentences?.length ?? 0} sentences)`
    );
    console.log(
      `[pipeline:${projectId}] transcribe: word timestamps enabled=${hasWordTimestamps}`
    );

    return transcript;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(
      `[pipeline:${projectId}] transcribe: Whisper transcription FAILED`
    );
    console.error(`[pipeline:${projectId}] error details:`, error);
    console.error(
      `[pipeline:${projectId}] transcribe: falling back to placeholder transcript — ${errorMessage}`
    );
    const duration = await getVideoDuration(videoPath);
    const segments: TranscriptSegment[] = [];
    const targetSegmentLength = Math.min(15, Math.max(10, duration / 12));
    const segmentCount = Math.max(2, Math.ceil(duration / targetSegmentLength));
    const segmentLength = duration / segmentCount;

    let segmentId = 0;
    for (let start = 0; start < duration; start += segmentLength) {
      const end = Math.min(start + segmentLength, duration);
      const text = `[Placeholder segment ${segmentId + 1} — Whisper transcription pending]`;
      segments.push({
        id: segmentId,
        start,
        end,
        text,
      });
      segmentId += 1;
    }

    if (segments.length === 0) {
      segments.push({
        id: 0,
        start: 0,
        end: duration,
        text: "[Placeholder — Whisper transcription pending]",
      });
    }

    const transcript: TranscriptData = {
      text: segments.map((s) => s.text).join(" "),
      segments,
      words: [],
      sentences: [],
      language: "en",
      duration,
      placeholder: true,
    };

    writeTranscript(projectId, transcript);
    console.log(
      `[pipeline:${projectId}] transcribe: FALLBACK MODE - placeholder transcript created (${segments.length} segments, ${duration.toFixed(1)}s)`
    );
    console.log(
      `[pipeline:${projectId}] transcribe: No word timestamps available in placeholder mode`
    );
    return transcript;
  }
}
