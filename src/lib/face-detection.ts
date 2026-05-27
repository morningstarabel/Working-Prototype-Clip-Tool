import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

export interface FaceDetectionSample {
  time: number;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
}

export interface FaceTrack {
  videoWidth: number;
  videoHeight: number;
  samples: FaceDetectionSample[];
  hasAnyFace: boolean;
}

const DEFAULT_SAMPLE_INTERVAL_SECONDS = 1.0;
const DEFAULT_MAX_SAMPLES = 45;
const PYTHON_CANDIDATES = [
  process.env.PYTHON_PATH,
  "python3",
  "python",
].filter(Boolean) as string[];

const SCRIPT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../scripts/face_detect.py"
);

async function findPython(): Promise<string> {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      await execFileAsync(candidate, ["-c", "import cv2"], {
        timeout: 10000,
      });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error(
    "Python 3 with opencv-python is required for face detection. Install it with: python3 -m pip install opencv-python"
  );
}

export async function detectFaceTrack(
  videoPath: string,
  options?: {
    sampleIntervalSeconds?: number;
    maxSamples?: number;
  }
): Promise<FaceTrack> {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`Video file not found: ${videoPath}`);
  }

  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`Face detection script not found: ${SCRIPT_PATH}`);
  }

  const python = await findPython();
  const sampleIntervalSeconds = options?.sampleIntervalSeconds ?? DEFAULT_SAMPLE_INTERVAL_SECONDS;
  const maxSamples = options?.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const outputFile = path.join(
    os.tmpdir(),
    `face-track-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  );

  try {
    await execFileAsync(
      python,
      [
        SCRIPT_PATH,
        videoPath,
        sampleIntervalSeconds.toString(),
        maxSamples.toString(),
        outputFile,
      ],
      { timeout: 120000 }
    );

    const raw = JSON.parse(fs.readFileSync(outputFile, "utf8")) as unknown;

    const maybeTrack = raw as {
      video_width?: unknown;
      video_height?: unknown;
      has_any_face?: unknown;
      samples?: unknown;
    };

    const sampleEntries = Array.isArray(maybeTrack.samples)
      ? maybeTrack.samples
      : [];

    return {
      videoWidth: Number(maybeTrack.video_width ?? 0),
      videoHeight: Number(maybeTrack.video_height ?? 0),
      hasAnyFace: Boolean(maybeTrack.has_any_face),
      samples: sampleEntries.map((sample) => {
        const entry = sample as {
          time?: unknown;
          x?: unknown;
          y?: unknown;
          w?: unknown;
          h?: unknown;
        };

        const time = Number(entry.time ?? 0);
        const x = entry.x == null ? null : Number(entry.x);
        const y = entry.y == null ? null : Number(entry.y);
        const w = entry.w == null ? null : Number(entry.w);
        const h = entry.h == null ? null : Number(entry.h);

        return {
          time,
          x: Number.isNaN(x) ? null : x,
          y: Number.isNaN(y) ? null : y,
          w: Number.isNaN(w) ? null : w,
          h: Number.isNaN(h) ? null : h,
        };
      }),
    };
  } catch (error) {
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
    throw new Error(
      error instanceof Error
        ? `Face detection failed: ${error.message}`
        : "Face detection failed"
    );
  } finally {
    if (fs.existsSync(outputFile)) {
      fs.unlinkSync(outputFile);
    }
  }
}
