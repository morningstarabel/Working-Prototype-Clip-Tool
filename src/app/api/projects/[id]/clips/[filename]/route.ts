import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { projectClipsDir } from "@/lib/paths";

export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{ id: string; filename: string }>;
};

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id, filename } = await params;
    const safeName = path.basename(filename);
    if (!/^clip-\d+\.mp4$/i.test(safeName)) {
      return NextResponse.json({ error: "Invalid clip filename" }, { status: 400 });
    }

    const filePath = path.join(projectClipsDir(id), safeName);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Clip not found" }, { status: 404 });
    }

    const buffer = fs.readFileSync(filePath);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to serve clip";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
