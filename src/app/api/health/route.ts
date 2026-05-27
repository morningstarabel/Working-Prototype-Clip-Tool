import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureDataDirs } from "@/lib/fs";
import fs from "fs";
import { DATA_DIR } from "@/lib/paths";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    ensureDataDirs();
    getDb();
    const dataDirExists = fs.existsSync(DATA_DIR);

    return NextResponse.json({
      ok: true,
      dataDir: dataDirExists,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Health check failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
