import { prepareSourceVideo } from "./download";
import { transcribeVideo } from "./transcribe";
import { analyzeTranscript } from "./analyze";
import { renderClips } from "./render";
import { failProject, readProjectMeta, setProjectStatus } from "./status";

export function startProjectPipeline(projectId: string): void {
  void runProjectPipeline(projectId).catch((error) => {
    console.error(`[pipeline:${projectId}] unhandled error:`, error);
  });
}

export async function runProjectPipeline(projectId: string): Promise<void> {
  console.log(`[pipeline:${projectId}] ========== pipeline start ==========`);

  const meta = readProjectMeta(projectId);
  if (!meta) {
    throw new Error(`Project ${projectId} not found`);
  }

  try {
    await setProjectStatus(projectId, "downloading", {
      message:
        meta.sourceType === "upload"
          ? "Preparing uploaded video"
          : "Downloading source video",
      progress: 5,
    });

    const sourcePath = await prepareSourceVideo(projectId, async (message) => {
      await setProjectStatus(projectId, "downloading", {
        message,
        progress: 15,
      });
    });

    await setProjectStatus(projectId, "transcribing", {
      message: "Building transcript",
      progress: 25,
    });
    await transcribeVideo(projectId, sourcePath);

    await setProjectStatus(projectId, "analyzing", {
      message: "Finding clip candidates",
      progress: 50,
    });
    const clips = await analyzeTranscript(projectId);

    await setProjectStatus(projectId, "rendering", {
      message: `Rendering ${clips.length} clips`,
      progress: 70,
    });
    await renderClips(projectId, sourcePath, clips);

    await setProjectStatus(projectId, "completed", {
      message: `Done — ${clips.length} clips ready`,
      progress: 100,
    });

    console.log(`[pipeline:${projectId}] ========== pipeline complete ==========`);
  } catch (error) {
    await failProject(projectId, error);
    throw error;
  }
}
