import fs from "fs";
import path from "path";
import {
  DATA_DIR,
  PROJECTS_DIR,
  projectClipsDir,
  projectClipsJsonPath,
  projectDir,
  projectMetaPath,
  projectTranscriptPath,
} from "@/lib/paths";
import type { AnalyzedClip, ProjectMeta, TranscriptData } from "@/types";

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function ensureDataDirs(): void {
  ensureDir(DATA_DIR);
  ensureDir(PROJECTS_DIR);
}

export function ensureProjectDirs(projectId: string): string {
  const dir = projectDir(projectId);
  ensureDir(dir);
  ensureDir(projectClipsDir(projectId));
  return dir;
}

export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function writeProjectMeta(projectId: string, meta: ProjectMeta): void {
  writeJson(projectMetaPath(projectId), meta);
}

export function writeTranscript(
  projectId: string,
  transcript: TranscriptData
): void {
  writeJson(projectTranscriptPath(projectId), transcript);
}

export function writeClipsJson(
  projectId: string,
  clips: AnalyzedClip[]
): void {
  writeJson(projectClipsJsonPath(projectId), clips);
}

export function deleteFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function deleteDirIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}
