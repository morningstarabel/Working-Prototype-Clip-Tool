import path from "path";

export const ROOT_DIR = process.cwd();
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const PROJECTS_DIR = path.join(DATA_DIR, "projects");
export const DB_PATH = path.join(DATA_DIR, "clip-tool.db");

export function projectDir(projectId: string): string {
  return path.join(PROJECTS_DIR, projectId);
}

export function projectMetaPath(projectId: string): string {
  return path.join(projectDir(projectId), "meta.json");
}

export function projectTranscriptPath(projectId: string): string {
  return path.join(projectDir(projectId), "transcript.json");
}

export function projectClipsJsonPath(projectId: string): string {
  return path.join(projectDir(projectId), "clips.json");
}

export function projectSourcePath(projectId: string): string {
  return path.join(projectDir(projectId), "source.mp4");
}

export function projectClipsDir(projectId: string): string {
  return path.join(projectDir(projectId), "clips");
}

export function clipFilePath(
  projectId: string,
  clipIndex: number
): string {
  const name = `clip-${String(clipIndex).padStart(2, "0")}.mp4`;
  return path.join(projectClipsDir(projectId), name);
}

export function clipCaptionFilePath(
  projectId: string,
  clipIndex: number
): string {
  const name = `clip-${String(clipIndex).padStart(2, "0")}.ass`;
  return path.join(projectClipsDir(projectId), name);
}
