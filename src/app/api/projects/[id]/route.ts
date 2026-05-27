import { NextRequest, NextResponse } from "next/server";
import { deleteProject, getClipsByProject, getProject } from "@/lib/db";
import { deleteDirIfExists } from "@/lib/fs";
import { readProjectMeta } from "@/lib/pipeline/status";
import { projectDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const meta = readProjectMeta(id);
    const clips = getClipsByProject(id);

    return NextResponse.json({ project, meta, clips });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const project = getProject(id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    deleteProject(id);
    deleteDirIfExists(projectDir(id));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete project";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
