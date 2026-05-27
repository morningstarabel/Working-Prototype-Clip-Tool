"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  PROCESSING_STEP_LABELS,
  PROCESSING_STEPS,
  type ProcessingStep,
} from "@/lib/constants";
import type { ProjectMeta, ProjectStatus } from "@/types";

const STATUS_PROGRESS: Record<ProjectStatus, number> = {
  pending: 5,
  downloading: 15,
  transcribing: 35,
  analyzing: 55,
  rendering: 80,
  completed: 100,
  failed: 0,
};

export default function ProcessingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const projectId = params.id;

  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [message, setMessage] = useState("Starting…");

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (!active || !res.ok) return;

        if (data.meta) setMeta(data.meta);

        const status = data.project?.status as ProjectStatus;
        if (status === "completed") {
          router.replace(`/projects/${projectId}`);
          return;
        }
        if (status === "failed") {
          setMessage(data.meta?.error ?? "Processing failed");
          return;
        }

        setMessage(
          PROCESSING_STEP_LABELS[
            (PROCESSING_STEPS.includes(status as ProcessingStep)
              ? status
              : "downloading") as ProcessingStep
          ] ?? status
        );
      } catch {
        // retry on next interval
      }
    }

    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [projectId, router]);

  const status = meta?.status ?? "pending";
  const progress = STATUS_PROGRESS[status] ?? 10;
  const stepIndex = PROCESSING_STEPS.indexOf(
    PROCESSING_STEPS.includes(status as ProcessingStep)
      ? (status as ProcessingStep)
      : "downloading"
  );
  const failed = status === "failed";

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Processing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {meta?.title ?? projectId}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            {failed ? (
              <AlertCircle className="h-5 w-5 text-destructive" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin" />
            )}
            {failed ? "Failed" : PROCESSING_STEP_LABELS[status as ProcessingStep] ?? status}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!failed && <Progress value={progress} />}
          <p
            className={
              failed
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {failed ? meta?.error ?? message : message}
          </p>
          <ol className="space-y-2 text-sm">
            {PROCESSING_STEPS.map((step, index) => {
              const done = !failed && index < stepIndex;
              const active = !failed && step === status;
              return (
                <li
                  key={step}
                  className={
                    active
                      ? "font-medium text-foreground"
                      : done
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                  }
                >
                  {done ? "✓ " : active ? "→ " : "  "}
                  {PROCESSING_STEP_LABELS[step]}
                </li>
              );
            })}
          </ol>
          {failed && (
            <Link
              href="/"
              className={cn(buttonVariants({ variant: "outline" }), "w-full inline-flex justify-center")}
            >
              Try again
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
