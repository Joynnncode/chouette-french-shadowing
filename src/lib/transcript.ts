export type TranscriptLine = { start: number; dur: number; text: string };

/**
 * Rough French speaking pace, used to spread approximate timestamps over a
 * pasted transcript. Real captions carry their own timings; this only matters
 * when we have nothing but text.
 */
const CHARS_PER_SECOND = 13;
const MIN_LINE_SECONDS = 1.2;

/** Sentences longer than this get split again at a clause boundary. */
const MAX_LINE_CHARS = 120;
/** Never leave a fragment shorter than this behind when splitting a clause. */
const MIN_CLAUSE_CHARS = 30;

/**
 * Words whose trailing period is part of the word, not the end of a sentence.
 * Lowercased, without the period.
 */
const ABBREVIATIONS = new Set([
  "m",
  "mm",
  "mme",
  "mmes",
  "mlle",
  "mlles",
  "mgr",
  "dr",
  "pr",
  "me",
  "st",
  "ste",
  "sts",
  "stes",
  "etc",
  "cf",
  "ex",
  "env",
  "vol",
  "chap",
  "art",
  "fig",
  "p",
  "pp",
  "no",
  "nos",
  "av",
  "apr",
  "jc",
  "tel",
  "tél",
  "réf",
  "ref",
  "min",
  "max",
]);

/** Conjunctions that make an acceptable breath-group break in a long sentence. */
const CLAUSE_OPENERS = [
  "et",
  "mais",
  "ou",
  "donc",
  "car",
  "parce que",
  "puisque",
  "lorsque",
  "quand",
  "pendant que",
  "alors que",
  "si",
];

const TERMINAL_PUNCTUATION = /[.!?…]/;
/** Punctuation that can trail a sentence's final mark: quotes and brackets. */
const TRAILING_CLOSERS = /[»"'’”)\]]/;

function endsSentence(text: string): boolean {
  const trimmed = text.replace(new RegExp(`${TRAILING_CLOSERS.source}+$`), "").trimEnd();
  return TERMINAL_PUNCTUATION.test(trimmed.slice(-1));
}

/** A line that can't be starting a new sentence — so it continues the last one. */
function isContinuation(line: string): boolean {
  const first = line.replace(/^[«"'“‘(\[\s]+/, "").charAt(0);
  if (!first) return false;
  return first !== first.toUpperCase() || /[\d,;:)…-]/.test(first);
}

/**
 * Rejoins lines that were wrapped mid-sentence — the shape YouTube's caption
 * chunks and most copy-pasted subtitle files come in. A line is only glued to
 * the previous one when the previous one didn't finish a sentence *and* this
 * one doesn't look like the start of a new one, so a transcript that is
 * already one-sentence-per-line survives untouched. A blank line is always
 * treated as a deliberate break.
 */
function rejoinWrappedLines(raw: string): string[] {
  const units: string[] = [];
  let afterBlank = false;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      afterBlank = true;
      continue;
    }

    const previous = units[units.length - 1];
    if (!afterBlank && previous !== undefined && !endsSentence(previous) && isContinuation(line)) {
      units[units.length - 1] = `${previous} ${line}`;
    } else {
      units.push(line);
    }
    afterBlank = false;
  }

  return units;
}

/** True when the period at `index` belongs to an abbreviation or a number. */
function isWordInternalPeriod(text: string, index: number): boolean {
  if (text[index] !== ".") return false;

  const next = text[index + 1];
  // 3.5 — a decimal separator, and "www.example.com" style runs.
  if (next && /[\d\p{L}]/u.test(next)) return true;

  const before = text.slice(0, index);
  const token = before.match(/[\p{L}\d.]+$/u)?.[0] ?? "";
  if (!token) return false;
  // "J. Chirac", "J.-C." — an initial rather than a sentence end. Only uppercase,
  // so a unit like "8 h." still ends its sentence.
  if (/^\p{Lu}$/u.test(token)) return true;
  if (/^\d+$/.test(token)) return false;
  return ABBREVIATIONS.has(token.replace(/\./g, "").toLowerCase());
}

/** True when what follows `index` reads like the beginning of a new sentence. */
function startsNewSentence(text: string, index: number): boolean {
  const rest = text.slice(index).replace(/^\s+/, "");
  if (!rest) return true;
  const first = rest.charAt(0);
  return /[«"'“‘(\[—–]/.test(first) || first === first.toUpperCase();
}

/** Splits one paragraph into sentences on terminal punctuation. */
function splitIntoSentences(text: string): string[] {
  const sentences: string[] = [];
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!TERMINAL_PUNCTUATION.test(text[i])) continue;
    if (isWordInternalPeriod(text, i)) continue;

    // Swallow "?!", "...", and any closing quote or bracket after the mark.
    let end = i;
    while (end + 1 < text.length && TERMINAL_PUNCTUATION.test(text[end + 1])) end++;
    while (end + 1 < text.length && TRAILING_CLOSERS.test(text[end + 1])) end++;
    // French typography spaces the closing guillemet off: « Quelle chance ! »
    let spaced = end + 1;
    while (spaced < text.length && /\s/.test(text[spaced])) spaced++;
    if (spaced < text.length && /[»”]/.test(text[spaced])) end = spaced;

    if (end + 1 >= text.length) break;
    if (!/\s/.test(text[end + 1])) continue;
    if (!startsNewSentence(text, end + 1)) continue;

    const sentence = text.slice(start, end + 1).trim();
    if (sentence) sentences.push(sentence);
    start = end + 1;
    i = end;
  }

  const tail = text.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences;
}

/** Break points inside a sentence that a speaker would pause at anyway. */
function clauseBreakPoints(text: string): number[] {
  const points: number[] = [];

  for (const match of text.matchAll(/[,;:]\s+/g)) {
    points.push(match.index + match[0].length);
  }
  for (const opener of CLAUSE_OPENERS) {
    const pattern = new RegExp(`\\s(?=${opener}\\s)`, "gi");
    for (const match of text.matchAll(pattern)) {
      points.push(match.index + 1);
    }
  }

  return [...new Set(points)].sort((a, b) => a - b);
}

/**
 * Splits a sentence that is too long to shadow in one go, always at a comma or
 * a conjunction and always as close to the middle as possible, so each piece
 * stays a readable clause instead of an arbitrary chunk.
 */
function splitLongSentence(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const middle = text.length / 2;
  const candidates = clauseBreakPoints(text).filter(
    (point) => point >= MIN_CLAUSE_CHARS && text.length - point >= MIN_CLAUSE_CHARS,
  );
  if (!candidates.length) return [text];

  const best = candidates.reduce((closest, point) =>
    Math.abs(point - middle) < Math.abs(closest - middle) ? point : closest,
  );

  return [
    ...splitLongSentence(text.slice(0, best).trim(), maxChars),
    ...splitLongSentence(text.slice(best).trim(), maxChars),
  ];
}

/**
 * Turns a block of French text into one line per sentence: caption-style
 * mid-sentence wraps are rejoined first, then the text is cut at real sentence
 * boundaries (abbreviations and decimals don't count), and any sentence still
 * too long to shadow is split at a clause boundary.
 */
export function segmentFrenchText(raw: string, maxChars = MAX_LINE_CHARS): string[] {
  return rejoinWrappedLines(raw)
    .flatMap((unit) => splitIntoSentences(unit.replace(/\s+/g, " ")))
    .flatMap((sentence) => splitLongSentence(sentence, maxChars))
    .filter(Boolean);
}

function estimateDuration(text: string, charsPerSecond = CHARS_PER_SECOND): number {
  return Math.max(MIN_LINE_SECONDS, Math.round((text.length / charsPerSecond) * 10) / 10);
}

/** Two tapped lines can't start closer together than this. */
const MIN_TAPPED_GAP = 0.3;

function round(seconds: number): number {
  return Math.round(seconds * 100) / 100;
}

/**
 * Replaces a transcript's estimated timings with the real ones captured by
 * tapping along with the audio. `starts[i]` is the tapped start of line `i`,
 * or null if that line was never tapped. Tapped starts are forced to stay in
 * order; a line's duration runs until the next line starts. Lines left
 * untapped after the last tap fall back to length-estimated pacing, so a
 * half-finished sync pass still leaves a usable transcript.
 */
export function applyTimings(
  transcript: TranscriptLine[],
  starts: (number | null)[],
): TranscriptLine[] {
  const resolved: number[] = [];

  for (let i = 0; i < transcript.length; i++) {
    const tapped = starts[i];
    const previous = resolved[i - 1];
    const floor = previous === undefined ? 0 : previous + MIN_TAPPED_GAP;

    if (typeof tapped === "number" && Number.isFinite(tapped)) {
      resolved.push(Math.max(floor, tapped));
    } else if (previous === undefined) {
      resolved.push(0);
    } else {
      resolved.push(previous + estimateDuration(transcript[i - 1].text));
    }
  }

  return transcript.map((line, i) => ({
    ...line,
    start: round(resolved[i]),
    dur: round(
      i + 1 < resolved.length
        ? resolved[i + 1] - resolved[i]
        : estimateDuration(line.text),
    ),
  }));
}

/** "1:23", "01:23.400", "00:01:23,400" → seconds. */
function parseClock(stamp: string): number {
  const parts = stamp.replace(",", ".").split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return NaN;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

const CLOCK = String.raw`(?:\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?`;
/** A WebVTT/SRT cue range, with the trailing cue settings VTT likes to add. */
const CUE_RANGE = new RegExp(String.raw`^(${CLOCK})\s*-->\s*(${CLOCK})`);
/** A timestamp alone on its line — how YouTube's "Show transcript" copies. */
const CLOCK_ONLY = new RegExp(String.raw`^\[?(${CLOCK})\]?$`);
/** A timestamp leading the line, with the text after it. */
const CLOCK_PREFIX = new RegExp(String.raw`^\[?(${CLOCK})\]?\s+(\S.*)$`);

/**
 * Reads a transcript that already carries timestamps and keeps them: YouTube's
 * "Show transcript" panel (copied straight out of the page), .srt and .vtt
 * files all land here. This is the one path that gives real timings without
 * tapping along, so it's tried before falling back to estimated pacing.
 * Returns null when the text carries no usable timestamps.
 */
export function parseTimedTranscript(raw: string, maxChars = MAX_LINE_CHARS): TranscriptLine[] | null {
  const cues: { start: number; end: number | null; text: string }[] = [];
  let pending: { start: number; end: number | null } | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    // WEBVTT headers, NOTE blocks, SRT cue numbers, and inline <c> word timings.
    if (!line || /^(WEBVTT|NOTE|Kind:|Language:)/i.test(line)) continue;
    if (/^\d+$/.test(line) && !pending) continue;

    const range = line.match(CUE_RANGE);
    if (range) {
      pending = { start: parseClock(range[1]), end: parseClock(range[2]) };
      continue;
    }

    const alone = line.match(CLOCK_ONLY);
    if (alone) {
      pending = { start: parseClock(alone[1]), end: null };
      continue;
    }

    const prefixed = line.match(CLOCK_PREFIX);
    const text = (prefixed ? prefixed[2] : line).replace(/<[^>]*>/g, "").trim();
    if (!text) continue;

    if (prefixed) {
      cues.push({ start: parseClock(prefixed[1]), end: null, text });
      pending = null;
    } else if (pending) {
      cues.push({ ...pending, text });
      pending = null;
    } else if (cues.length) {
      // A cue whose text wrapped onto a second line.
      cues[cues.length - 1].text += ` ${text}`;
    }
  }

  const usable = cues.filter((cue) => Number.isFinite(cue.start));
  if (usable.length < 2) return null;

  const lines: TranscriptLine[] = [];
  for (const [i, cue] of usable.entries()) {
    // YouTube's rolling auto-captions repeat the previous cue's text.
    const previous = lines[lines.length - 1];
    if (previous && (previous.text === cue.text || previous.text.endsWith(cue.text))) continue;

    const next = usable[i + 1];
    const end = cue.end ?? next?.start ?? cue.start + estimateDuration(cue.text);
    lines.push({
      start: round(cue.start),
      dur: round(Math.max(0.3, end - cue.start)),
      text: cue.text,
    });
  }

  return mergeCaptionLines(lines, maxChars);
}

/**
 * Turns a manually pasted transcript into TranscriptLine[]. If the paste
 * carries timestamps they are kept as-is (see `parseTimedTranscript`);
 * otherwise lines are re-segmented into sentences (see `segmentFrenchText`)
 * and each is given a duration proportional to its length rather than a flat
 * per-line guess, so the highlight drifts far less over a long clip.
 * `startOffset` shifts every line so it lines up with a clip's start time —
 * timestamped pastes are already absolute, so it doesn't apply to them.
 */
export function parseManualTranscript(
  raw: string,
  options: { startOffset?: number; charsPerSecond?: number; maxChars?: number } = {},
): TranscriptLine[] {
  const { startOffset = 0, charsPerSecond = CHARS_PER_SECOND, maxChars = MAX_LINE_CHARS } = options;

  const timed = parseTimedTranscript(raw, maxChars);
  if (timed?.length) return timed;

  let cursor = startOffset;
  return segmentFrenchText(raw, maxChars).map((text) => {
    const dur = estimateDuration(text, charsPerSecond);
    const line = { start: Math.round(cursor * 10) / 10, dur, text };
    cursor += dur;
    return line;
  });
}

/**
 * Merges caption events that were cut mid-sentence into whole sentences,
 * keeping the real timings: a merged line starts when its first chunk did and
 * lasts until its last one ends. Tracks with no punctuation at all would
 * otherwise collapse into one giant line, so merging stops at `maxChars`.
 */
export function mergeCaptionLines(
  lines: TranscriptLine[],
  maxChars = MAX_LINE_CHARS,
): TranscriptLine[] {
  const merged: TranscriptLine[] = [];

  for (const line of lines) {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) continue;

    const previous = merged[merged.length - 1];
    const canMerge =
      previous !== undefined &&
      !endsSentence(previous.text) &&
      isContinuation(text) &&
      previous.text.length + text.length + 1 <= maxChars;

    if (canMerge) {
      previous.text = `${previous.text} ${text}`;
      previous.dur = Math.round((line.start + line.dur - previous.start) * 10) / 10;
    } else {
      merged.push({ ...line, text });
    }
  }

  return merged;
}
