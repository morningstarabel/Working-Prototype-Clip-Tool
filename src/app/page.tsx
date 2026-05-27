"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { isAllowedVideoFile, isValidYouTubeUrl } from "@/lib/validate";

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function startProject(body: FormData | { youtubeUrl: string }) {
    setSubmitting(true);
    try {
      const init =
        body instanceof FormData
          ? { method: "POST", body }
          : {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            };

      const res = await fetch("/api/projects", init);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to start project");
      }

      router.push(`/projects/${data.projectId}/processing`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleYouTube(e: React.FormEvent) {
    e.preventDefault();
    const url = youtubeUrl.trim();
    if (!isValidYouTubeUrl(url)) {
      toast.error("Enter a valid YouTube URL");
      return;
    }
    await startProject({ youtubeUrl: url });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedVideoFile(file)) {
      toast.error("Upload an MP4 or MOV file");
      e.target.value = "";
      return;
    }

    const form = new FormData();
    form.append("file", file);
    await startProject(form);
    e.target.value = "";
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Short-form clip generator
        </h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          Paste a YouTube link or upload a video. We transcribe with Whisper,
          find viral moments with Claude, and render captioned 9:16 clips with
          FFmpeg.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Link2 className="h-5 w-5" />
              YouTube URL
            </CardTitle>
            <CardDescription>
              Downloaded with yt-dlp on your Mac, then processed locally.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleYouTube} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="youtube-url">Video URL</Label>
                <Input
                  id="youtube-url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  disabled={submitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Starting…" : "Process YouTube video"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Upload className="h-5 w-5" />
              Local upload
            </CardTitle>
            <CardDescription>MP4 or MOV from your machine.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,.mp4,.mov"
              className="hidden"
              onChange={handleUpload}
              disabled={submitting}
            />
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={submitting}
              onClick={() => fileInputRef.current?.click()}
            >
              {submitting ? "Starting…" : "Choose video file"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Files are saved under <code className="text-foreground">/data/projects/</code>
            </p>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <p className="text-sm text-muted-foreground">
        Requires <code className="text-foreground">OPENAI_API_KEY</code> and{" "}
        <code className="text-foreground">ANTHROPIC_API_KEY</code> in{" "}
        <code className="text-foreground">.env.local</code>.
      </p>
    </div>
  );
}
