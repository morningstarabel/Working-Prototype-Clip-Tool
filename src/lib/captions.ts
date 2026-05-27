import fs from "fs";
import path from "path";
import os from "os";
import { TranscriptData, TranscriptWord } from "@/types";
import type { FaceTrack } from "@/lib/face-detection";

const ASS_HEADER = `Script Info:
Title: Clip captions
ScriptType: v4.00+
WrapStyle: 2
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Caption,Arial,50,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,3,1,0,2,20,20,30,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\r\n|\r|\n/g, "\\N")
    .replace(/\u00A0/g, " ");
}

function formatAssTime(seconds: number): string {
  const totalCentis = Math.max(0, Math.round(seconds * 100));
  const centis = totalCentis % 100;
  const totalSeconds = Math.floor(totalCentis / 100);
  const secs = totalSeconds % 60;
  const mins = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function wrapCaptionLines(words: string[], maxChars = 28, maxLines = 2): string[] {
  const lines: string[] = [];
  let currentLine = "";
  let currentWords: string[] = [];

  for (const word of words) {
    const candidate = currentLine.length === 0 ? word : `${currentLine} ${word}`;
    if (
      currentWords.length >= 8 ||
      (candidate.length > maxChars && currentWords.length > 0)
    ) {
      lines.push(currentLine);
      currentLine = word;
      currentWords = [word];
      if (lines.length >= maxLines) {
        break;
      }
      continue;
    }

    currentLine = candidate;
    currentWords.push(word);
  }

  if (lines.length < maxLines && currentLine.length > 0) {
    lines.push(currentLine);
  }

  if (lines.length > maxLines) {
    return lines.slice(0, maxLines);
  }

  return lines;
}

function buildCaptionWindow(words: TranscriptWord[], currentIndex: number): TranscriptWord[] {
  const windowSize = 14;
  const before = 4;
  const after = 9;
  let start = Math.max(0, currentIndex - before);
  let end = Math.min(words.length, currentIndex + after + 1);
  if (end - start > windowSize) {
    start = Math.max(0, currentIndex - Math.floor(windowSize / 2));
    end = Math.min(words.length, start + windowSize);
  }
  if (end - start > windowSize) {
    start = end - windowSize;
  }
  return words.slice(start, end);
}

function computeCaptionY(
  srcHeight: number,
  faceTrack: FaceTrack | undefined,
  clipStart: number,
  clipEnd: number
): number {
  if (!faceTrack?.hasAnyFace) {
    return srcHeight * 0.92;
  }

  const relevant = faceTrack.samples.filter(
    (sample) =>
      sample.x != null &&
      sample.y != null &&
      sample.h != null &&
      sample.time >= clipStart &&
      sample.time <= clipEnd
  );

  if (relevant.length === 0) {
    return srcHeight * 0.92;
  }

  const faceBottom = Math.max(
    ...relevant.map((sample) => sample.y! + sample.h!)
  );

  if (faceBottom > srcHeight * 0.65) {
    return srcHeight * 0.74;
  }

  return srcHeight * 0.92;
}

export function buildCaptionAss(
  transcript: TranscriptData,
  clipStart: number,
  clipEnd: number,
  srcWidth: number,
  srcHeight: number,
  faceTrack?: FaceTrack
): string {
  const words = transcript.words || [];
  const segments = transcript.segments || [];

  const clipWords = words
    .filter((word) => word.end > clipStart && word.start < clipEnd)
    .map((word) => ({
      ...word,
      start: Math.max(word.start, clipStart) - clipStart,
      end: Math.min(word.end, clipEnd) - clipStart,
    }));

  const clipSegments = segments
    .filter((segment) => segment.end > clipStart && segment.start < clipEnd)
    .map((segment) => ({
      start: Math.max(segment.start, clipStart) - clipStart,
      end: Math.min(segment.end, clipEnd) - clipStart,
      word: segment.text,
      text: segment.text,
    }));

  const effectiveWords = clipWords.length > 0 ? clipWords : clipSegments;
  if (effectiveWords.length === 0) {
    return "";
  }

  const captionY = Math.round(
    computeCaptionY(srcHeight, faceTrack, clipStart, clipEnd)
  );

  const events: string[] = [];
  for (let index = 0; index < effectiveWords.length; index += 1) {
    const current = effectiveWords[index];
    const windowWords = buildCaptionWindow(effectiveWords, index);
    const activeWordIndex = windowWords.findIndex(
      (w) => w.start === current.start && w.end === current.end
    );
    const rawWords = windowWords.map((w) => w.word);
    const lines = wrapCaptionLines(rawWords);

    let activeIndex = activeWordIndex;
    if (activeIndex < 0) {
      activeIndex = Math.min(windowWords.length - 1, Math.floor(windowWords.length / 2));
    }

    const highlightedLines: string[] = [];
    let usedCount = 0;
    for (const line of lines) {
      const lineWords = line.split(" ");
      const built = lineWords
        .map((word, wordIndex) => {
          const globalIndex = usedCount + wordIndex;
          const escaped = escapeAssText(word);
          if (globalIndex === activeIndex && clipWords.length > 0) {
            return `{\\c&H00FFFFFF&\\b1}${escaped}{\\b0}`;
          }
          return escaped;
        })
        .join(" ");
      highlightedLines.push(built);
      usedCount += lineWords.length;
    }

    const endTime = index < effectiveWords.length - 1
      ? Math.max(current.end, effectiveWords[index + 1].start)
      : current.end;

    const startText = formatAssTime(current.start);
    const endText = formatAssTime(Math.min(endTime, clipEnd - clipStart));
    const text = `{\\pos(${Math.round(srcWidth / 2)},${captionY})\\fad(100,100)\\an2}${highlightedLines.join("\\N")}`;

    events.push(
      `Dialogue: 0,${startText},${endText},Caption,,0,0,0,,${text}`
    );
  }

  return `${ASS_HEADER}\n${events.join("\n")}`;
}

export function writeCaptionAssFile(
  projectId: string,
  clipIndex: number,
  assContent: string
): string {
  const base = path.join(os.tmpdir(), `clip-${clipIndex}-${Date.now()}.ass`);
  fs.writeFileSync(base, assContent, "utf8");
  return base;
}
