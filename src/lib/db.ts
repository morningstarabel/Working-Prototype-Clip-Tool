import Database from "better-sqlite3";
import fs from "fs";
import { DB_PATH, DATA_DIR } from "@/lib/paths";
import type { ClipRow, Project, ProjectStatus, SourceType } from "@/types";

let db: Database.Database | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT,
      source_url TEXT,
      source_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clips (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      title TEXT,
      hook TEXT,
      platform TEXT,
      viral_score INTEGER,
      file_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_clips_project_id ON clips(project_id);
    CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
  `);
}

export function getDb(): Database.Database {
  if (!db) {
    ensureDataDir();
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

export function createProject(input: {
  id: string;
  title?: string | null;
  sourceUrl?: string | null;
  sourceType: SourceType;
  status?: ProjectStatus;
}): Project {
  const database = getDb();
  const createdAt = new Date().toISOString();
  const status = input.status ?? "pending";

  database
    .prepare(
      `INSERT INTO projects (id, title, source_url, source_type, created_at, status)
       VALUES (@id, @title, @source_url, @source_type, @created_at, @status)`
    )
    .run({
      id: input.id,
      title: input.title ?? null,
      source_url: input.sourceUrl ?? null,
      source_type: input.sourceType,
      created_at: createdAt,
      status,
    });

  return {
    id: input.id,
    title: input.title ?? null,
    source_url: input.sourceUrl ?? null,
    source_type: input.sourceType,
    created_at: createdAt,
    status,
  };
}

export function updateProjectStatus(
  id: string,
  status: ProjectStatus,
  title?: string | null
): void {
  const database = getDb();
  if (title !== undefined) {
    database
      .prepare(`UPDATE projects SET status = @status, title = @title WHERE id = @id`)
      .run({ id, status, title });
  } else {
    database
      .prepare(`UPDATE projects SET status = @status WHERE id = @id`)
      .run({ id, status });
  }
}

export function getProject(id: string): Project | undefined {
  const database = getDb();
  return database
    .prepare(`SELECT * FROM projects WHERE id = ?`)
    .get(id) as Project | undefined;
}

export function listProjects(): Project[] {
  const database = getDb();
  return database
    .prepare(`SELECT * FROM projects ORDER BY created_at DESC`)
    .all() as Project[];
}

export function deleteProject(id: string): void {
  const database = getDb();
  database.prepare(`DELETE FROM clips WHERE project_id = ?`).run(id);
  database.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
}

export function insertClip(input: {
  id: string;
  projectId: string;
  startTime: number;
  endTime: number;
  title?: string | null;
  hook?: string | null;
  platform?: string | null;
  viralScore?: number | null;
  filePath?: string | null;
}): ClipRow {
  const database = getDb();
  const createdAt = new Date().toISOString();

  database
    .prepare(
      `INSERT INTO clips (
        id, project_id, start_time, end_time, title, hook,
        platform, viral_score, file_path, created_at
      ) VALUES (
        @id, @project_id, @start_time, @end_time, @title, @hook,
        @platform, @viral_score, @file_path, @created_at
      )`
    )
    .run({
      id: input.id,
      project_id: input.projectId,
      start_time: input.startTime,
      end_time: input.endTime,
      title: input.title ?? null,
      hook: input.hook ?? null,
      platform: input.platform ?? null,
      viral_score: input.viralScore ?? null,
      file_path: input.filePath ?? null,
      created_at: createdAt,
    });

  return {
    id: input.id,
    project_id: input.projectId,
    start_time: input.startTime,
    end_time: input.endTime,
    title: input.title ?? null,
    hook: input.hook ?? null,
    platform: input.platform ?? null,
    viral_score: input.viralScore ?? null,
    file_path: input.filePath ?? null,
    created_at: createdAt,
  };
}

export function getClipsByProject(projectId: string): ClipRow[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT * FROM clips WHERE project_id = ? ORDER BY start_time ASC`
    )
    .all(projectId) as ClipRow[];
}

export function deleteClipsByProject(projectId: string): void {
  const database = getDb();
  database.prepare(`DELETE FROM clips WHERE project_id = ?`).run(projectId);
}

export function updateClipTimes(
  clipId: string,
  startTime: number,
  endTime: number
): void {
  const database = getDb();
  database
    .prepare(
      `UPDATE clips SET start_time = @start_time, end_time = @end_time WHERE id = @id`
    )
    .run({ id: clipId, start_time: startTime, end_time: endTime });
}

export function updateClipFilePath(clipId: string, filePath: string): void {
  const database = getDb();
  database
    .prepare(`UPDATE clips SET file_path = @file_path WHERE id = @id`)
    .run({ id: clipId, file_path: filePath });
}
