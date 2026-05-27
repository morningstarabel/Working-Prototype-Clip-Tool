import { updateProjectStatus } from "@/lib/db";
import { readJson, writeProjectMeta } from "@/lib/fs";
import { projectMetaPath } from "@/lib/paths";
import { emitProgress } from "@/lib/progress";
import type { ProjectMeta, ProjectStatus } from "@/types";

export function readProjectMeta(projectId: string): ProjectMeta | null {
  return readJson<ProjectMeta>(projectMetaPath(projectId));
}

export async function setProjectStatus(
  projectId: string,
  status: ProjectStatus,
  options?: { error?: string; message?: string; progress?: number }
): Promise<void> {
  console.log(`[pipeline:${projectId}] status → ${status}`, options?.message ?? "");

  updateProjectStatus(projectId, status);

  const meta = readProjectMeta(projectId);
  if (meta) {
    writeProjectMeta(projectId, {
      ...meta,
      status,
      error:
        status === "failed"
          ? options?.error ?? meta.error
          : undefined,
    });
  }

  if (options?.message) {
    emitProgress(projectId, {
      step: status,
      message: options.message,
      progress: options.progress,
    });
  }
}

export async function failProject(
  projectId: string,
  error: unknown
): Promise<void> {
  const message =
    error instanceof Error ? error.message : "Processing failed";
  console.error(`[pipeline:${projectId}] failed:`, message);
  await setProjectStatus(projectId, "failed", { error: message, message });
}
