const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

function isValidVideoId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^[\w-]{11}$/.test(id);
}

function isYouTubeHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const stripped = h.replace(/^www\./, "");
  return YOUTUBE_HOSTS.has(h) || YOUTUBE_HOSTS.has(stripped);
}

/**
 * Normalizes standard YouTube URLs to a canonical watch URL.
 * Supports watch, shorts, embed, live, youtu.be, m.youtube.com, music.youtube.com.
 */
export function parseYouTubeUrl(raw: string): string | null {
  try {
    const input = raw.trim();
    const parsed = new URL(
      input.startsWith("http") ? input : `https://${input}`
    );

    const hostname = parsed.hostname.toLowerCase();
    const host = hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = parsed.pathname.replace(/^\//, "").split("/")[0];
      return isValidVideoId(id) ? `https://www.youtube.com/watch?v=${id}` : null;
    }

    if (!isYouTubeHost(hostname)) {
      return null;
    }

    if (parsed.pathname === "/watch") {
      const id = parsed.searchParams.get("v");
      return isValidVideoId(id) ? `https://www.youtube.com/watch?v=${id}` : null;
    }

    const pathPatterns = [
      /^\/shorts\/([\w-]{11})/,
      /^\/embed\/([\w-]{11})/,
      /^\/live\/([\w-]{11})/,
      /^\/v\/([\w-]{11})/,
    ];

    for (const pattern of pathPatterns) {
      const match = parsed.pathname.match(pattern);
      if (match && isValidVideoId(match[1])) {
        return `https://www.youtube.com/watch?v=${match[1]}`;
      }
    }

    return null;
  } catch {
    return null;
  }
}
