import { execFile } from "child_process";
import { promisify } from "util";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import { CLIP_OUTPUT } from "@/lib/constants";
import type { FaceTrack } from "@/lib/face-detection";

const execFileAsync = promisify(execFile);

const FFMPEG_PATH =
  process.env.FFMPEG_PATH ?? "/opt/homebrew/bin/ffmpeg";
const FFPROBE_PATH =
  process.env.FFPROBE_PATH ?? "/opt/homebrew/bin/ffprobe";

ffmpeg.setFfmpegPath(FFMPEG_PATH);
ffmpeg.setFfprobePath(FFPROBE_PATH);

export function assertFfmpegAvailable(): void {
  if (!fs.existsSync(FFMPEG_PATH)) {
    throw new Error(
      `FFmpeg not found at ${FFMPEG_PATH}. Install with: brew install ffmpeg`
    );
  }
}

export async function getVideoDuration(videoPath: string): Promise<number> {
  assertFfmpegAvailable();

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`ffprobe failed: ${err.message}`));
        return;
      }
      const duration = metadata.format.duration;
      if (duration == null || duration <= 0) {
        reject(new Error("Could not determine video duration"));
        return;
      }
      resolve(duration);
    });
  });
}

export async function getVideoDimensions(
  videoPath: string
): Promise<{ width: number; height: number }> {
  assertFfmpegAvailable();

  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(new Error(`ffprobe failed: ${err.message}`));
        return;
      }
      const stream = metadata.streams?.find(
        (s) => s.codec_type === "video"
      );
      if (!stream || !stream.width || !stream.height) {
        reject(new Error("Could not determine video dimensions"));
        return;
      }
      resolve({ width: stream.width, height: stream.height });
    });
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeFfmpegFilePath(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,");
}

function isValidCaptionPath(value: string | undefined): value is string {
  return Boolean(value && fs.existsSync(value));
}

function buildPiecewiseExpression(
  points: { time: number; value: number }[],
  clampMax: number
): string {
  if (points.length === 0) {
    return "0";
  }

  const normalized = points
    .map((point) => ({
      time: Number(point.time.toFixed(3)),
      value: Number(point.value.toFixed(3)),
    }))
    .filter((point, index, arr) =>
      index === 0 || point.time !== arr[index - 1].time
    );

  if (normalized.length === 1) {
    return clamp(normalized[0].value, 0, clampMax).toFixed(3);
  }

  let expression = normalized[normalized.length - 1].value.toFixed(3);
  for (let index = normalized.length - 2; index >= 0; index -= 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    const segment = `${current.value.toFixed(3)} + (${next.value.toFixed(
      3
    )} - ${current.value.toFixed(3)}) * (t - ${current.time.toFixed(3)}) / (${(
      next.time - current.time
    ).toFixed(3)})`;
    expression = `if(lt(t,${next.time.toFixed(3)}),${segment},${expression})`;
  }

  return `max(0,min(${clampMax.toFixed(3)},${expression}))`;
}

function buildFaceAwareKeyframes(
  faceTrack: FaceTrack | undefined,
  clipDuration: number,
  srcWidth: number,
  srcHeight: number,
  cropWidth: number,
  cropHeight: number
): { time: number; x: number; y: number }[] {
  const minX = cropWidth / 2;
  const maxX = srcWidth - cropWidth / 2;
  const minY = cropHeight / 2;
  const maxY = srcHeight - cropHeight / 2;
  const defaultX = srcWidth / 2;
  const defaultY = srcHeight / 2;

  const clippedSamples = faceTrack?.samples
    .map((sample) => ({
      time: sample.time,
      x:
        sample.x != null && sample.w != null
          ? sample.x + sample.w / 2
          : null,
      y:
        sample.y != null && sample.h != null
          ? sample.y + sample.h / 2
          : null,
    }))
    .filter((sample) => sample.time >= 0 && sample.time <= clipDuration) ?? [];

  const extended: { time: number; x: number; y: number }[] = [];
  if (clippedSamples.length === 0) {
    return [
      { time: 0, x: clamp(defaultX, minX, maxX), y: clamp(defaultY, minY, maxY) },
      {
        time: clipDuration,
        x: clamp(defaultX, minX, maxX),
        y: clamp(defaultY, minY, maxY),
      },
    ];
  }

  const sorted = [...clippedSamples].sort((a, b) => a.time - b.time);
  let lastX = clamp(defaultX, minX, maxX);
  let lastY = clamp(defaultY, minY, maxY);

  for (const sample of sorted) {
    const x = sample.x == null ? lastX : clamp(sample.x, minX, maxX);
    const y = sample.y == null ? lastY : clamp(sample.y, minY, maxY);
    extended.push({ time: sample.time, x, y });
    lastX = x;
    lastY = y;
  }

  if (extended[0].time > 0) {
    extended.unshift({
      time: 0,
      x: extended[0].x,
      y: extended[0].y,
    });
  }

  if (extended[extended.length - 1].time < clipDuration) {
    extended.push({
      time: clipDuration,
      x: extended[extended.length - 1].x,
      y: extended[extended.length - 1].y,
    });
  }

  const smoothed = extended.map((point, index, points) => {
    const windowStart = Math.max(0, index - 1);
    const windowEnd = Math.min(points.length, index + 2);
    const window = points.slice(windowStart, windowEnd);
    const avgX = window.reduce((sum, item) => sum + item.x, 0) / window.length;
    const avgY = window.reduce((sum, item) => sum + item.y, 0) / window.length;
    return {
      time: point.time,
      x: clamp(avgX, minX, maxX),
      y: clamp(avgY, minY, maxY),
    };
  });

  return smoothed;
}

export function verticalContainBlurFilter(
  width: number = CLIP_OUTPUT.width,
  height: number = CLIP_OUTPUT.height
): string[] {
  return [
    "[0:v]split=2[bg][fg]",
    `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=luma_radius=45:luma_power=2:chroma_radius=30:chroma_power=1[blurred]`,
    `[fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[scaled]`,
    `[blurred][scaled]overlay=(W-w)/2:(H-h)/2[out]`,
  ];
}

export function verticalFaceAwareReframeFilter(
  srcWidth: number,
  srcHeight: number,
  faceTrack: FaceTrack | undefined,
  clipDuration: number,
  width: number = CLIP_OUTPUT.width,
  height: number = CLIP_OUTPUT.height
): string[] {
  const targetAspect = width / height;
  const cropWidth = srcWidth / srcHeight >= targetAspect
    ? Math.round(srcHeight * targetAspect)
    : srcWidth;
  const cropHeight = srcWidth / srcHeight >= targetAspect
    ? srcHeight
    : Math.round(srcWidth / targetAspect);

  const keyframes = buildFaceAwareKeyframes(
    faceTrack,
    clipDuration,
    srcWidth,
    srcHeight,
    cropWidth,
    cropHeight
  );

  const xExpression = buildPiecewiseExpression(
    keyframes.map((point) => ({ time: point.time, value: point.x - cropWidth / 2 })),
    srcWidth - cropWidth
  );
  const yExpression = buildPiecewiseExpression(
    keyframes.map((point) => ({ time: point.time, value: point.y - cropHeight / 2 })),
    srcHeight - cropHeight
  );

  return [
    "[0:v]split=2[bg][fg]",
    `[bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=luma_radius=45:luma_power=2:chroma_radius=30:chroma_power=1[blurred]`,
    `[fg]crop=${cropWidth}:${cropHeight}:x='${xExpression}':y='${yExpression}'[cropped]`,
    `[cropped]scale=${width}:${height}[scaled]`,
    `[blurred][scaled]overlay=(W-w)/2:(H-h)/2[out]`,
  ];
}

type RenderMode =
  | "face-caption"
  | "face-only"
  | "caption-only"
  | "plain";

function buildVideoFilter(
  srcWidth: number,
  srcHeight: number,
  clipFaceTrack: FaceTrack | undefined,
  duration: number,
  width: number,
  height: number,
  captionAssPath: string | undefined,
  mode: RenderMode
): string[] {
  const faceEnabled = mode === "face-caption" || mode === "face-only";
  const captionEnabled = mode === "face-caption" || mode === "caption-only";
  const useFaceTrack = faceEnabled && clipFaceTrack?.hasAnyFace;

  const baseFilter = useFaceTrack
    ? verticalFaceAwareReframeFilter(
        srcWidth,
        srcHeight,
        clipFaceTrack,
        duration,
        width,
        height
      )
    : verticalContainBlurFilter(width, height);

  if (!captionEnabled || !captionAssPath) {
    return baseFilter;
  }

  const escapedPath = escapeFfmpegFilePath(captionAssPath);
  const filter = [...baseFilter];
  filter[filter.length - 1] = filter[filter.length - 1].replace(
    /\[out\]$/,
    "[overlayed]"
  );
  filter.push(`[overlayed]ass=${escapedPath}[out]`);
  return filter;
}

async function renderClipWithMode(
  inputPath: string,
  outputPath: string,
  startTime: number,
  duration: number,
  complexFilter: string[],
  videoCodec: string,
  audioCodec: string
): Promise<void> {
  let ffmpegCommand = "";
  let stderrOutput = "";

  await new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration)
      .complexFilter(complexFilter)
      .outputOptions([
        "-map",
        "[out]",
        "-map",
        "0:a?",
        "-c:v",
        videoCodec,
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        audioCodec,
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        "-pix_fmt",
        "yuv420p",
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        ffmpegCommand = cmd;
        console.log("[ffmpeg] start:", cmd);
      })
      .on("stderr", (line) => {
        stderrOutput += `${line}\n`;
        console.error("[ffmpeg] stderr:", line);
      })
      .on("error", (err) => {
        reject(
          new Error(
            `FFmpeg render failed: ${err.message}\nCommand: ${ffmpegCommand}\nStderr:\n${stderrOutput}`
          )
        );
      })
      .on("end", () => resolve())
      .run();
  });
}

export async function renderClip(options: {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
  faceTrack?: FaceTrack;
  captionAssPath?: string;
}): Promise<void> {
  assertFfmpegAvailable();

  const { inputPath, outputPath, startTime, endTime, faceTrack, captionAssPath } = options;
  const duration = Math.max(0.5, endTime - startTime);
  const { width, height, videoCodec, audioCodec } = CLIP_OUTPUT;
  const { width: srcWidth, height: srcHeight } = await getVideoDimensions(inputPath);

  const clipFaceTrack = faceTrack
    ? {
        ...faceTrack,
        samples: faceTrack.samples
          .map((sample) => ({
            ...sample,
            time: sample.time - startTime,
          }))
          .filter((sample) => sample.time >= -1 && sample.time <= duration + 1),
      }
    : undefined;

  const validCaptionAssPath = isValidCaptionPath(captionAssPath)
    ? captionAssPath
    : undefined;

  if (captionAssPath && !validCaptionAssPath) {
    console.warn(
      `[ffmpeg] caption ASS path invalid or missing: ${captionAssPath}. captions disabled for this render.`
    );
  }

  const captionPathLog = validCaptionAssPath
    ? `caption path=${validCaptionAssPath}`
    : "no captions";
  const faceTrackLog = clipFaceTrack?.hasAnyFace
    ? `face track samples=${clipFaceTrack.samples.length}`
    : "no face tracking";

  const modes: RenderMode[] = [
    "face-caption",
    "face-only",
    "caption-only",
    "plain",
  ];

  let lastError: Error | null = null;

  for (const mode of modes) {
    if (mode === "face-caption" && (!clipFaceTrack?.hasAnyFace || !validCaptionAssPath)) {
      continue;
    }
    if (mode === "face-only" && !clipFaceTrack?.hasAnyFace) {
      continue;
    }
    if (mode === "caption-only" && !validCaptionAssPath) {
      continue;
    }

    const captionForMode = mode === "face-only" || mode === "plain" ? undefined : validCaptionAssPath;
    const complexFilter = buildVideoFilter(
      srcWidth,
      srcHeight,
      clipFaceTrack,
      duration,
      width,
      height,
      captionForMode,
      mode
    );

    console.log(
      `[ffmpeg] render mode=${mode} ${captionPathLog} ${faceTrackLog} ` +
        `output=${outputPath} start=${startTime}s dur=${duration.toFixed(2)}s`
    );
    console.log(`[ffmpeg] active filter chain: ${complexFilter.join(" | ")}`);

    try {
      await renderClipWithMode(
        inputPath,
        outputPath,
        startTime,
        duration,
        complexFilter,
        videoCodec,
        audioCodec
      );
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ffmpeg] render failed for mode=${mode}: ${lastError.message}`);
    }
  }

  throw lastError ?? new Error("FFmpeg render failed with unknown error");
}

export async function extractAudioWav(
  videoPath: string,
  outputPath: string
): Promise<void> {
  assertFfmpegAvailable();

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
    outputPath,
  ]);
}
