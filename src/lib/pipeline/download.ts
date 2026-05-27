import fs from "fs";
import { getVideoDuration } from "@/lib/ffmpeg";
import { projectSourcePath } from "@/lib/paths";
import { downloadYouTubeToFile } from "@/lib/ytdlp";
import { updateProjectStatus } from "@/lib/db";
import { readProjectMeta, setProjectStatus } from "./status";
import { writeProjectMeta } from "@/lib/fs";

export type DownloadProgressCallback = (message: string) => Promise<void>;

export async function prepareSourceVideo(
  projectId: string,
  onProgress?: DownloadProgressCallback
): Promise<string> {
  const meta = readProjectMeta(projectId);
  if (!meta) {
    throw new Error("Project metadata not found");
  }

  const sourcePath = projectSourcePath(projectId);

  if (meta.sourceType === "youtube") {
    if (!meta.sourceUrl) {
      throw new Error("YouTube project is missing source URL");
    }

    const notify = async (message: string) => {
      console.log(`[pipeline:${projectId}] download: ${message}`);
      await onProgress?.(message);
      await setProjectStatus(projectId, "downloading", { message, progress: 15 });
    };

    if (!fs.existsSync(sourcePath) || fs.statSync(sourcePath).size === 0) {
      await notify("Starting YouTube download (max 720p)…");

      const result = await downloadYouTubeToFile(meta.sourceUrl, sourcePath, {
        onProgress: (msg) => {
          void notify(msg);
        },
      });

      if (result.title) {
        updateProjectStatus(projectId, "downloading", result.title);
        writeProjectMeta(projectId, {
          ...meta,
          title: result.title,
          sourceUrl: result.normalizedUrl,
          status: "downloading",
        });
        console.log(`[pipeline:${projectId}] download: title="${result.title}"`);
      }
    } else {
      await notify("YouTube video already downloaded, verifying…");
    }
  } else {
    if (!fs.existsSync(sourcePath)) {
      throw new Error(
        `Source video missing at ${sourcePath}. Re-upload the file.`
      );
    }

    await onProgress?.("Preparing uploaded video");
  }

  const stats = fs.statSync(sourcePath);
  if (stats.size === 0) {
    throw new Error("Source video file is empty");
  }

  const duration = await getVideoDuration(sourcePath);
  console.log(
    `[pipeline:${projectId}] source ready: ${sourcePath} (${duration.toFixed(1)}s, ${(stats.size / 1024 / 1024).toFixed(1)} MB)`
  );

  return sourcePath;
}
