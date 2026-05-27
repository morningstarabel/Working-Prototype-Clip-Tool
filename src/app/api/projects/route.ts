import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createProject, listProjects } from "@/lib/db";
import { ensureDataDirs, ensureProjectDirs, writeProjectMeta } from "@/lib/fs";
import { startProjectPipeline } from "@/lib/pipeline";
import {
  isAllowedVideoFile,
  isValidYouTubeUrl,
  normalizeYouTubeUrl,
} from "@/lib/validate";
import { projectSourcePath } from "@/lib/paths";
import type { ProjectMeta, SourceType } from "@/types";
import fs from "fs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const projects = listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list projects";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureDataDirs();
    const projectId = uuidv4();
    ensureProjectDirs(projectId);

    const contentType = request.headers.get("content-type") ?? "";

    let sourceType: SourceType;
    let sourceUrl: string | null = null;
    let title: string | null = null;
    let sourceFilename: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "No video file provided" },
          { status: 400 }
        );
      }

      if (!isAllowedVideoFile(file)) {
        return NextResponse.json(
          { error: "Upload an MP4 or MOV file" },
          { status: 400 }
        );
      }

      sourceType = "upload";
      title = file.name;
      sourceFilename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());
      fs.writeFileSync(projectSourcePath(projectId), buffer);
      console.log(
        `[api] saved upload for ${projectId}: ${file.name} (${buffer.length} bytes)`
      );
    } else {
      const body = await request.json();
      const youtubeUrl =
        typeof body.youtubeUrl === "string" ? body.youtubeUrl.trim() : "";

      if (!isValidYouTubeUrl(youtubeUrl)) {
        return NextResponse.json(
          { error: "Enter a valid YouTube URL" },
          { status: 400 }
        );
      }

      const normalized = normalizeYouTubeUrl(youtubeUrl);
      sourceType = "youtube";
      sourceUrl = normalized;
      title = "YouTube video";
      console.log(`[api] YouTube project ${projectId}: ${normalized}`);
    }

    const meta: ProjectMeta = {
      id: projectId,
      title,
      sourceUrl,
      sourceType,
      sourceFilename,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    writeProjectMeta(projectId, meta);
    createProject({
      id: projectId,
      title,
      sourceUrl,
      sourceType,
      status: "pending",
    });

    console.log(`[api] created project ${projectId}, starting pipeline`);
    startProjectPipeline(projectId);

    return NextResponse.json({
      projectId,
      status: "pending",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
