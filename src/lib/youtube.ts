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
 * Best-effort transcript fetch via YouTube's public timedtext endpoint. As of
 * mid-2026 YouTube blocks most non-browser requests to this endpoint (empty
 * body, HTTP 200), so this frequently returns null — callers should treat
 * that as normal and fall back to a manually pasted transcript instead of
 * retrying with spoofed headers or tokens.
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

/**
 * Turns a manually pasted transcript (one line per subtitle/sentence) into
 * TranscriptLine[] with evenly spaced approximate timestamps. Used when
 * automatic caption fetching fails or a clip has no official captions.
 * `startOffset` shifts every line so it lines up with a clip's start time.
 */
export function parseManualTranscript(
  raw: string,
  secondsPerLine = 4,
  startOffset = 0,
): TranscriptLine[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text, i) => ({ start: startOffset + i * secondsPerLine, dur: secondsPerLine, text }));
}

/** Parses "1:45", "0:05", or a bare seconds string like "105" into seconds. */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);

  const parts = trimmed.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return null;

  const nums = parts.map((p) => parseInt(p, 10));
  return nums.reduce((total, n) => total * 60 + n, 0);
}
