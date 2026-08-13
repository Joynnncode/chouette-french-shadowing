import { mergeCaptionLines, type TranscriptLine } from "./transcript";

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

export type { TranscriptLine } from "./transcript";

type CaptionTrack = { baseUrl: string; languageCode: string; kind?: string };

/** The public InnerTube key YouTube's own web player ships with. */
const INNERTUBE_KEY = "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w";

/**
 * Caption track list via InnerTube. The watch page still lists the tracks, but
 * the baseUrls it hands out now answer 200 with an empty body — they need a
 * proof-of-origin token the page's JS mints. The mobile clients are exempt, so
 * their baseUrls actually return captions. YouTube may still refuse from a
 * datacenter IP, hence every caller treating null as normal.
 */
async function fetchCaptionTracks(videoId: string): Promise<CaptionTrack[]> {
  for (const client of [
    { clientName: "IOS", clientVersion: "20.10.4" },
    { clientName: "ANDROID", clientVersion: "20.10.38", androidSdkVersion: 30 },
  ]) {
    try {
      const res = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${INNERTUBE_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          context: { client: { ...client, hl: "fr", gl: "FR" } },
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const tracks: CaptionTrack[] =
        json?.captions?.playerCaptionsTracklistRenderer?.captionTracks ?? [];
      if (tracks.length) return tracks;
    } catch {
      // Try the next client.
    }
  }
  return [];
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(text: string): string {
  // Twice: YouTube's XML double-encodes apostrophes as &amp;#39;.
  const once = text.replace(/&#(\d+);|&[a-z]+;/gi, (match, code) =>
    code ? String.fromCharCode(Number(code)) : (HTML_ENTITIES[match.toLowerCase()] ?? match),
  );
  return once.replace(/&#(\d+);|&[a-z]+;/gi, (match, code) =>
    code ? String.fromCharCode(Number(code)) : (HTML_ENTITIES[match.toLowerCase()] ?? match),
  );
}

/**
 * Caption bodies come back in three shapes depending on which client's baseUrl
 * we ended up with: json3, the `<transcript><text>` XML, or timedtext v3
 * `<p t= d=>` XML.
 */
/** "[Musique]", "[Applaudissements]", "♪♪♪" — nothing to shadow. */
function isSoundEffectCue(text: string): boolean {
  return !text.replace(/\[[^\]]*\]|[♪♫\s]+/g, "");
}

function parseCaptionBody(body: string): TranscriptLine[] {
  const lines: TranscriptLine[] = [];

  if (body.trimStart().startsWith("{")) {
    const json = JSON.parse(body);
    for (const event of json.events ?? []) {
      if (!event.segs) continue;
      const text = event.segs
        .map((seg: { utf8?: string }) => seg.utf8 ?? "")
        .join("")
        .trim();
      if (!text || isSoundEffectCue(text)) continue;
      lines.push({
        start: (event.tStartMs ?? 0) / 1000,
        dur: (event.dDurationMs ?? 2000) / 1000,
        text,
      });
    }
    return lines;
  }

  for (const match of body.matchAll(
    /<(?:text|p)\b[^>]*\b(?:start|t)="([\d.]+)"[^>]*?(?:\b(?:dur|d)="([\d.]+)")?[^>]*>([\s\S]*?)<\/(?:text|p)>/g,
  )) {
    // `t`/`d` are milliseconds in timedtext v3, seconds in the legacy format.
    const isMilliseconds = /<p\b/.test(match[0]);
    const text = decodeEntities(match[3].replace(/<[^>]+>/g, "")).trim();
    if (!text || isSoundEffectCue(text)) continue;
    lines.push({
      start: Number(match[1]) / (isMilliseconds ? 1000 : 1),
      dur: (match[2] ? Number(match[2]) : 2000) / (isMilliseconds ? 1000 : 1),
      text,
    });
  }
  return lines;
}

/**
 * Best-effort transcript fetch. Auto-generated ("asr") tracks count — they are
 * often all a learner video has — but a human-written track in the target
 * language wins when both exist. Caption events are cut to fit the caption box
 * rather than at sentence ends, so they get merged back into sentences.
 * Returns null whenever YouTube declines, which callers treat as normal.
 */
export async function getTranscript(
  videoId: string,
  preferredLang = "fr",
): Promise<TranscriptLine[] | null> {
  const tracks = await fetchCaptionTracks(videoId);
  if (!tracks.length) return null;

  const inLanguage = tracks.filter(
    (t) => t.languageCode === preferredLang || t.languageCode?.startsWith(`${preferredLang}-`),
  );
  // A transcript in the wrong language is worse than none here, so anything
  // else only counts when the video ships a single track (its own language).
  const track =
    inLanguage.find((t) => t.kind !== "asr") ??
    inLanguage[0] ??
    (tracks.length === 1 ? tracks[0] : undefined);
  if (!track?.baseUrl) return null;

  try {
    const res = await fetch(`${track.baseUrl}&fmt=json3`);
    if (!res.ok) return null;
    const body = await res.text();
    const events = parseCaptionBody(body);
    return events.length ? mergeCaptionLines(events) : null;
  } catch {
    return null;
  }
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
