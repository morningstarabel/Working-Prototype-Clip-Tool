"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ClipRow, Project } from "@/types";

export default function ProjectResultsPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [clips, setClips] = useState<ClipRow[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        setProject(data.project ?? null);
        setClips(data.clips ?? []);
      })
      .catch(() => {
        setProject(null);
        setClips([]);
      });
  }, [projectId]);

  function clipUrl(index: number): string {
    const name = `clip-${String(index).padStart(2, "0")}.mp4`;
    return `/api/projects/${projectId}/clips/${name}`;
  }

  return (
    <div className="space-y-6">
      <Link
        href="/history"
        className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to history
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {project?.title ?? "Clips"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {clips.length} rendered clip{clips.length === 1 ? "" : "s"}
        </p>
      </div>

      {clips.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          No clips yet. Processing may still be running.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip, i) => {
            const index = i + 1;
            const url = clipUrl(index);
            let platforms: string[] = [];
            try {
              platforms = clip.platform ? JSON.parse(clip.platform) : [];
            } catch {
              platforms = [];
            }

            return (
              <Card key={clip.id} className="overflow-hidden">
                <div className="relative aspect-[9/16] bg-black">
                  <video
                    src={url}
                    className="h-full w-full object-cover"
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => void e.currentTarget.play()}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                </div>
                <CardHeader className="pb-2">
                  <CardTitle className="line-clamp-2 text-base">
                    {clip.title ?? `Clip ${index}`}
                  </CardTitle>
                  <div className="flex flex-wrap gap-1">
                    {platforms.map((p) => (
                      <Badge key={p} variant="secondary" className="text-xs">
                        {p}
                      </Badge>
                    ))}
                    {clip.viral_score != null && (
                      <Badge variant="outline">★ {clip.viral_score}</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    {clip.start_time.toFixed(1)}s – {clip.end_time.toFixed(1)}s
                  </p>
                  {clip.hook && <p className="text-sm">{clip.hook}</p>}
                  <a
                    href={url}
                    download={`clip-${index}.mp4`}
                    className={cn(buttonVariants({ size: "sm" }), "w-full inline-flex")}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download MP4
                  </a>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
