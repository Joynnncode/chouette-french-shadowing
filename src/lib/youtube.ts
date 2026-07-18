export function extractYoutubeVideoId(input: string): string | null {
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes("youtu.be")) {
      return url.pathname.slice(1) || null;
    }
    if (url.hostname.includes("youtube.com")) {
      const v = url.searchParams.get("v");
      if (v) return v;
      const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];
    }
  } catch {
    // not a URL
  }
  return null;
}

export async function getVideoInfo(videoId: string): Promise<{
  title: string;
  channelName: string | null;
} | null> {
  const res = await fetch(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`,
    )}&format=json`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  return { title: data.title as string, channelName: (data.author_name as string) ?? null };
}

export type TranscriptLine = { start: number; dur: number; text: string };

/**
 * Best-effort transcript fetch via YouTube's public timedtext endpoint.
 * This is the same undocumented-but-widely-used approach most open-source
 * transcript tools rely on; it can break if YouTube changes its page markup,
 * in which case clips fall back to "no transcript" and can be added manually.
 */
export async function getTranscript(
  videoId: string,
  preferredLang = "fr",
): Promise<TranscriptLine[] | null> {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { "Accept-Language": "en-US,en;q=0.9" },
  });
  if (!pageRes.ok) return null;
  const html = await pageRes.text();

  const match = html.match(/"captionTracks":(\[.*?\])/);
  if (!match) return null;

  let tracks: { baseUrl: string; languageCode: string; kind?: string }[];
  try {
    tracks = JSON.parse(match[1].replace(/\\u0026/g, "&"));
  } catch {
    return null;
  }
  if (!tracks.length) return null;

  const track =
    tracks.find((t) => t.languageCode === preferredLang) ??
    tracks.find((t) => t.languageCode?.startsWith(preferredLang)) ??
    tracks[0];
  if (!track) return null;

  const ttRes = await fetch(`${track.baseUrl}&fmt=json3`);
  if (!ttRes.ok) return null;
  const ttJson = await ttRes.json();

  const events: TranscriptLine[] = [];
  for (const ev of ttJson.events ?? []) {
    if (!ev.segs) continue;
    const text = ev.segs.map((s: { utf8: string }) => s.utf8).join("").trim();
    if (!text) continue;
    events.push({
      start: (ev.tStartMs ?? 0) / 1000,
      dur: (ev.dDurationMs ?? 2000) / 1000,
      text,
    });
  }
  return events.length ? events : null;
}
