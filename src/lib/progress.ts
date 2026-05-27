import type { ProgressEvent } from "@/types";

const listeners = new Map<string, Set<(event: ProgressEvent) => void>>();

export function subscribeToProgress(
  projectId: string,
  listener: (event: ProgressEvent) => void
): () => void {
  if (!listeners.has(projectId)) {
    listeners.set(projectId, new Set());
  }
  listeners.get(projectId)!.add(listener);

  return () => {
    listeners.get(projectId)?.delete(listener);
  };
}

export function emitProgress(
  projectId: string,
  event: ProgressEvent
): void {
  listeners.get(projectId)?.forEach((listener) => listener(event));
}
