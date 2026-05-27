import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import { getVideoDimensions, renderClip } from "@/lib/ffmpeg";
import { detectFaceTrack } from "@/lib/face-detection";
import {
  deleteClipsByProject,
  insertClip,
} from "@/lib/db";
import { readJson } from "@/lib/fs";
import { buildCaptionAss, writeCaptionAssFile } from "@/lib/captions";
import {
  clipFilePath,
  projectClipsJsonPath,
  projectTranscriptPath,
} from "@/lib/paths";
import type { AnalyzedClip, TranscriptData } from "@/types";
import { setProjectStatus } from "./status";

export async function renderClips(
  projectId: string,
  sourcePath: string,
  clips?: AnalyzedClip[]
): Promise<string[]> {
  const analyzed =
    clips ??
    readJson<AnalyzedClip[]>(projectClipsJsonPath(projectId)) ??
    (() => {
      throw new Error("clips.json not found — run analyze first");
    })();

  if (analyzed.length === 0) {
    throw new Error("No clips to render");
  }

  console.log(
    `[pipeline:${projectId}] render: starting ${analyzed.length} clips`
  );

  deleteClipsByProject(projectId);

  let faceTrack;
  try {
    faceTrack = await detectFaceTrack(sourcePath, {
      sampleIntervalSeconds: 1.0,
      maxSamples: 45,
    });
    console.log(
      `[pipeline:${projectId}] render: detected faces for ${faceTrack.samples.length} samples, hasAnyFace=${faceTrack.hasAnyFace}`
    );
  } catch (error) {
    console.warn(
      `[pipeline:${projectId}] face detection failed, falling back to center crop: ${
        error instanceof Error ? error.message : error
      }`
    );
  }

  const transcript = readJson<TranscriptData>(projectTranscriptPath(projectId));
  const hasTranscript = Boolean(transcript && (transcript.words?.length || transcript.segments?.length));
  if (!hasTranscript) {
    console.warn(
      `[pipeline:${projectId}] render: no transcript data found, captions disabled`
    );
  }
  const { width: srcWidth, height: srcHeight } = await getVideoDimensions(sourcePath);

  const outputPaths: string[] = [];

  for (let i = 0; i < analyzed.length; i++) {
    const clip = analyzed[i];
    const index = i + 1;
    const outputPath = clipFilePath(projectId, index);

    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }

    await setProjectStatus(projectId, "rendering", {
      message: `Rendering clip ${index} of ${analyzed.length}`,
      progress: Math.round((i / analyzed.length) * 100),
    });

    console.log(
      `[pipeline:${projectId}] render: clip ${index} ${clip.start_time}s → ${clip.end_time}s → ${outputPath}`
    );

    let captionAssPath: string | undefined;
    if (hasTranscript && transcript) {
      const ass = buildCaptionAss(
        transcript,
        clip.start_time,
        clip.end_time,
        srcWidth,
        srcHeight,
        faceTrack
      );
      if (ass) {
        captionAssPath = writeCaptionAssFile(projectId, index, ass);
        console.log(
          `[pipeline:${projectId}] render: clip ${index} burning captions from transcript (${transcript.words.length} words, ${transcript.sentences?.length ?? 0} sentences)`
        );
      } else {
        console.log(
          `[pipeline:${projectId}] render: clip ${index} generated no caption events for this range`
        );
      }
    }

    let renderedSuccessfully = false;
    try {
      await renderClip({
        inputPath: sourcePath,
        outputPath,
        startTime: clip.start_time,
        endTime: clip.end_time,
        faceTrack,
        captionAssPath,
      });

      if (!fs.existsSync(outputPath)) {
        throw new Error(`Render failed — output missing: ${outputPath}`);
      }

      renderedSuccessfully = true;
    } catch (error) {
      console.error(
        `[pipeline:${projectId}] render: clip ${index} failed, skipping clip: ${
          error instanceof Error ? error.message : error
        }`
      );
    } finally {
      if (captionAssPath && fs.existsSync(captionAssPath)) {
        fs.unlinkSync(captionAssPath);
      }
    }

    if (!renderedSuccessfully) {
      continue;
    }

    const clipId = uuidv4();
    insertClip({
      id: clipId,
      projectId,
      startTime: clip.start_time,
      endTime: clip.end_time,
      title: clip.title,
      hook: clip.best_hook,
      platform: JSON.stringify(clip.platform),
      viralScore: clip.viral_score,
      filePath: outputPath,
    });

    outputPaths.push(outputPath);
    console.log(
      `[pipeline:${projectId}] render: clip ${index} done (${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB)`
    );
  }

  console.log(
    `[pipeline:${projectId}] render: completed ${outputPaths.length} clips`
  );

  return outputPaths;
}
