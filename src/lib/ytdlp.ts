import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export const YT_DLP_PATH =
  process.env.YT_DLP_PATH ?? "/opt/homebrew/bin/yt-dlp";

/** Default 15 minutes */
export const YT_DLP_TIMEOUT_MS = Number(
  process.env.YT_DLP_TIMEOUT_MS ?? 15 * 60 * 1000
);

import { parseYouTubeUrl } from "@/lib/youtube-url";

export { parseYouTubeUrl };

export function assertYtDlpAvailable(): void {
  if (!fs.existsSync(YT_DLP_PATH)) {
    throw new Error(
      `yt-dlp not found at ${YT_DLP_PATH}. Install with: brew install yt-dlp`
    );
  }
}

export async function fetchYouTubeTitle(url: string): Promise<string | null> {
  assertYtDlpAvailable();
  const normalized = parseYouTubeUrl(url);
  if (!normalized) return null;

  try {
    const { stdout } = await runYtDlp(
      ["--no-warnings", "--no-playlist", "--print", "title", normalized],
      Math.min(30_000, YT_DLP_TIMEOUT_MS)
    );
    const title = stdout.trim();
    return title || null;
  } catch {
    return null;
  }
}

export interface YouTubeDownloadResult {
  outputPath: string;
  title: string | null;
  normalizedUrl: string;
}

export async function downloadYouTubeToFile(
  url: string,
  outputPath: string,
  options?: {
    onProgress?: (message: string) => void;
    timeoutMs?: number;
  }
): Promise<YouTubeDownloadResult> {
  assertYtDlpAvailable();

  const normalized = parseYouTubeUrl(url);
  if (!normalized) {
    throw new Error("Invalid or unsupported YouTube URL");
  }

  const timeoutMs = options?.timeoutMs ?? YT_DLP_TIMEOUT_MS;
  const dir = path.dirname(outputPath);
  const baseName = path.basename(outputPath, path.extname(outputPath));
  const outputTemplate = path.join(dir, `${baseName}.%(ext)s`);

  cleanupPartialDownloads(dir, baseName);

  options?.onProgress?.("Fetching video info…");
  const title = await fetchYouTubeTitle(normalized);

  const formatSelector =
    "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/" +
    "bestvideo[height<=720]+bestaudio/" +
    "best[height<=720]/" +
    "best";

  const args = [
    "--no-warnings",
    "--no-playlist",
    "--newline",
    "-f",
    formatSelector,
    "--merge-output-format",
    "mp4",
    "-o",
    outputTemplate,
    normalized,
  ];

  console.log("[yt-dlp] download start:", normalized);

  try {
    await runYtDlp(args, timeoutMs, (line) => {
      const progress = parseProgressLine(line);
      if (progress) options?.onProgress?.(progress);
    });
  } catch (error) {
    cleanupPartialDownloads(dir, baseName);
    const message =
      error instanceof Error ? error.message : "YouTube download failed";
    throw new Error(`YouTube download failed: ${message}`);
  }

  const finalPath = resolveDownloadedFile(dir, baseName, outputPath);
  if (!finalPath || !fs.existsSync(finalPath)) {
    cleanupPartialDownloads(dir, baseName);
    throw new Error("Download finished but output file was not found");
  }

  const stats = fs.statSync(finalPath);
  if (stats.size === 0) {
    fs.unlinkSync(finalPath);
    throw new Error("Downloaded file is empty");
  }

  if (finalPath !== outputPath) {
    fs.renameSync(finalPath, outputPath);
  }

  console.log(
    `[yt-dlp] download complete: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)${title ? ` title="${title}"` : ""}`
  );

  return { outputPath, title, normalizedUrl: normalized };
}

function resolveDownloadedFile(
  dir: string,
  baseName: string,
  expectedPath: string
): string | null {
  if (fs.existsSync(expectedPath)) return expectedPath;

  const candidates = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.startsWith(baseName) &&
        /\.(mp4|mkv|webm|mov)$/i.test(f) &&
        !f.endsWith(".part")
    )
    .map((f) => path.join(dir, f));

  return candidates[0] ?? null;
}

function cleanupPartialDownloads(dir: string, baseName: string): void {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (
      file.startsWith(baseName) &&
      (file.endsWith(".part") ||
        file.endsWith(".ytdl") ||
        file.endsWith(".temp") ||
        /\.f\d+\./.test(file))
    ) {
      try {
        fs.unlinkSync(path.join(dir, file));
      } catch {
        // ignore cleanup errors
      }
    }
  }
  if (fs.existsSync(path.join(dir, `${baseName}.mp4`))) {
    try {
      fs.unlinkSync(path.join(dir, `${baseName}.mp4`));
    } catch {
      // ignore
    }
  }
}

function parseProgressLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const pct = trimmed.match(/(\d+(?:\.\d+)?)%/);
  if (pct) return `Downloading… ${pct[1]}%`;

  if (/download|merger|fragment/i.test(trimmed)) {
    return trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
  }

  return null;
}

function runYtDlp(
  args: string[],
  timeoutMs: number,
  onStdoutLine?: (line: string) => void
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(YT_DLP_PATH, args, { stdio: ["ignore", "pipe", "pipe"] });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 3000);
    }, timeoutMs);

    const handleLine = (chunk: string, isErr: boolean) => {
      const text = chunk.toString();
      if (isErr) stderr += text;
      else stdout += text;

      for (const line of text.split(/\r?\n/)) {
        if (line.trim()) onStdoutLine?.(line);
      }
    };

    child.stdout?.on("data", (d) => handleLine(d, false));
    child.stderr?.on("data", (d) => handleLine(d, true));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to start yt-dlp: ${err.message}`));
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new Error(
            `Download timed out after ${Math.round(timeoutMs / 1000)}s. Try a shorter video or increase YT_DLP_TIMEOUT_MS.`
          )
        );
        return;
      }
      if (code !== 0) {
        const detail = (stderr || stdout).trim().split("\n").slice(-3).join(" ");
        reject(
          new Error(
            detail || `yt-dlp exited with code ${code ?? "unknown"}`
          )
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}
