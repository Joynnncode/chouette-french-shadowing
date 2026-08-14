import { generateText, transcribe } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogle } from "@ai-sdk/google";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { clips } from "@/db/schema";
import {
  mergeCaptionLines,
  parseManualTranscript,
  parseTimedTranscript,
  type TranscriptLine,
} from "@/lib/transcript";

// Transcribing a few minutes of audio takes well past the usual API budget.
export const maxDuration = 300;

/** Whisper's own cap; Gemini's is the 20 MB ceiling on an inline request. */
const MAX_AUDIO_BYTES: Record<string, number> = {
  openai: 25 * 1024 * 1024,
  gemini: 18 * 1024 * 1024,
};

/**
 * Gemini has no transcription model in the AI SDK — it transcribes as an
 * ordinary generation over an audio part. Asking for SRT rather than prose is
 * what gets timestamps out of it in a shape we already parse.
 */
const GEMINI_PROMPT = `Transcris cet audio en français, mot pour mot.

Réponds UNIQUEMENT avec un fichier SRT valide, sans texte d'introduction et sans balises markdown. Format exact :

1
00:00:00,000 --> 00:00:03,120
La première phrase.

2
00:00:03,120 --> 00:00:07,400
La deuxième phrase.

Règles :
- Une phrase complète par sous-titre, jamais coupée au milieu.
- Garde la ponctuation et les accents.
- Les horodatages doivent correspondre au moment réel où la phrase est prononcée dans l'audio.
- Ne traduis rien, n'ajoute aucun commentaire.`;

async function transcribeWithWhisper(apiKey: string, audio: Uint8Array): Promise<TranscriptLine[]> {
  const result = await transcribe({
    model: createOpenAI({ apiKey }).transcription("whisper-1"),
    audio,
    providerOptions: {
      openai: { language: "fr", timestampGranularities: ["segment"] },
    },
  });

  // Segments come with real timings and punctuation, so they only need merging
  // where Whisper cut mid-sentence. Should a model ever answer without
  // segments, the plain text still beats nothing.
  const segments: TranscriptLine[] = result.segments
    .map((segment) => ({
      start: segment.startSecond,
      dur: Math.max(0.3, segment.endSecond - segment.startSecond),
      text: segment.text.trim(),
    }))
    .filter((line) => line.text);

  return segments.length ? mergeCaptionLines(segments) : parseManualTranscript(result.text);
}

async function transcribeWithGemini(
  apiKey: string,
  model: string,
  audio: Uint8Array,
  mediaType: string,
): Promise<TranscriptLine[]> {
  const { text } = await generateText({
    model: createGoogle({ apiKey })(model),
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data: audio, mediaType },
          { type: "text", text: GEMINI_PROMPT },
        ],
      },
    ],
  });

  // It ignores "no markdown" often enough to be worth stripping.
  const srt = text.replace(/^\s*```[a-z]*\s*|\s*```\s*$/g, "").trim();
  return parseTimedTranscript(srt) ?? parseManualTranscript(srt);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const { clipId }: { clipId?: string } = await req.json();
  if (!clipId) {
    return Response.json({ error: "No clip given" }, { status: 400 });
  }

  const provider = req.headers.get("x-ai-provider") ?? "";
  const apiKey = req.headers.get("x-ai-key");
  const model = req.headers.get("x-ai-model") || "gemini-3.6-flash";
  if (!apiKey) {
    return Response.json({ error: "Add an API key in AI settings first." }, { status: 400 });
  }
  if (provider !== "openai" && provider !== "gemini") {
    return Response.json(
      {
        error:
          "Transcribing needs a Gemini or OpenAI key — Anthropic has no speech-to-text. Switch the provider in AI settings.",
      },
      { status: 400 },
    );
  }

  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip) {
    return Response.json({ error: "That clip is gone." }, { status: 404 });
  }
  if (!clip.audioUrl) {
    return Response.json(
      { error: "This clip has no uploaded audio — only audio clips can be transcribed." },
      { status: 400 },
    );
  }

  let audio: Uint8Array;
  let mediaType: string;
  try {
    const audioRes = await fetch(clip.audioUrl);
    if (!audioRes.ok) throw new Error(String(audioRes.status));
    mediaType = audioRes.headers.get("content-type") ?? "audio/mpeg";
    audio = new Uint8Array(await audioRes.arrayBuffer());
  } catch (error) {
    console.error("Couldn't read the clip's audio:", error);
    return Response.json({ error: "Couldn't read this clip's audio file." }, { status: 502 });
  }

  const limit = MAX_AUDIO_BYTES[provider];
  if (audio.byteLength > limit) {
    return Response.json(
      {
        error: `That audio is over the ${Math.round(limit / 1024 / 1024)} MB limit for ${
          provider === "openai" ? "Whisper" : "Gemini"
        } — split it into shorter clips.`,
      },
      { status: 413 },
    );
  }

  try {
    const transcript =
      provider === "openai"
        ? await transcribeWithWhisper(apiKey, audio)
        : await transcribeWithGemini(apiKey, model, audio, mediaType);

    if (!transcript.length) {
      return Response.json({ error: "Nothing was heard in this audio." }, { status: 422 });
    }

    await db.update(clips).set({ transcript }).where(eq(clips.id, clipId));
    revalidatePath(`/library/${clipId}`);

    return Response.json({ lines: transcript.length, provider });
  } catch (error) {
    console.error("Transcription failed:", error);
    return Response.json({ error: "The transcription request failed." }, { status: 502 });
  }
}
