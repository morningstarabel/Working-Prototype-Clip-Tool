"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Project } from "@/types";

export default function HistoryPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load history");
      setProjects(data.projects ?? []);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load history";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete(id: string) {
    if (!confirm("Delete this project and all its clips?")) return;

    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      toast.success("Project deleted");
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Delete failed";
      toast.error(message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-1 text-muted-foreground">
          Past projects stored in SQLite and on disk under{" "}
          <code className="text-foreground">/data</code>.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No projects yet.{" "}
            <Link href="/" className="text-foreground underline">
              Create your first clip
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    {project.title ?? "Untitled project"}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {new Date(project.created_at).toLocaleString()} ·{" "}
                    {project.source_type}
                  </p>
                </div>
                <Badge variant="secondary">{project.status}</Badge>
              </CardHeader>
              <CardContent className="flex items-center gap-2">
                <Link
                  href={
                    project.status === "completed"
                      ? `/projects/${project.id}`
                      : `/projects/${project.id}/processing`
                  }
                  className={cn(buttonVariants({ size: "sm", variant: "default" }))}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => handleDelete(project.id)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
