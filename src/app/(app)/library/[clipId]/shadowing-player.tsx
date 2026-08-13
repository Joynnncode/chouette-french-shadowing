"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { normalizeFrenchWord, type DictionaryResult } from "@/lib/dictionary";
import { loadAiSettings, useHasAiKey } from "@/lib/ai-settings";
import { speak } from "@/lib/speech";
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Pencil,
  Volume1,
  Volume2,
  Languages,
} from "lucide-react";
import { toast } from "sonner";
import { addVocabularyAction } from "../../vocabulary/actions";
import { uploadRecordingAction, deleteRecordingAction } from "./recordings-actions";
import { updateTranscriptAction } from "../actions";

type TranscriptLine = { start: number; dur: number; text: string };
type Recording = { id: string; url: string; createdAt: Date };

declare global {
  interface Window {
    YT: {
      Player: new (
        el: HTMLElement,
        opts: {
          videoId: string;
          playerVars?: Record<string, unknown>;
          events?: { onReady?: () => void };
        },
      ) => YTPlayer;
    };
    onYouTubeIframeAPIReady: () => void;
  }
}

type YTPlayer = {
  getCurrentTime: () => number;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
};

function loadYoutubeApi(): Promise<void> {
  return new Promise((resolve) => {
    if (window.YT?.Player) {
      resolve();
      return;
    }
    const existing = document.getElementById("youtube-iframe-api");
    if (!existing) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = () => resolve();
  });
}

export function ShadowingPlayer({
  clipId,
  youtubeVideoId,
  audioUrl,
  transcript,
  startSeconds,
  recordings,
}: {
  clipId: string;
  youtubeVideoId: string | null;
  audioUrl: string | null;
  transcript: TranscriptLine[];
  startSeconds: number;
  recordings: Recording[];
}) {
  const playerRef = useRef<YTPlayer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceAudioRef = useRef<HTMLAudioElement>(null);
  const activeLineRef = useRef<HTMLButtonElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Subscribed once here rather than in every WordTapper.
  const hasAiKey = useHasAiKey();

  const router = useRouter();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  function getCurrentTime(): number {
    if (youtubeVideoId) return playerRef.current?.getCurrentTime() ?? 0;
    return sourceAudioRef.current?.currentTime ?? 0;
  }

  function seekTo(seconds: number) {
    if (youtubeVideoId) {
      playerRef.current?.seekTo(seconds, true);
    } else if (sourceAudioRef.current) {
      sourceAudioRef.current.currentTime = seconds;
      sourceAudioRef.current.play();
    }
  }

  useEffect(() => {
    if (!youtubeVideoId) return;
    let cancelled = false;
    loadYoutubeApi().then(() => {
      if (cancelled || !containerRef.current) return;
      playerRef.current = new window.YT.Player(containerRef.current, {
        videoId: youtubeVideoId,
        playerVars: { rel: 0, start: startSeconds || undefined },
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeVideoId]);

  useEffect(() => {
    if (!transcript.length) return;
    const interval = setInterval(() => {
      const t = getCurrentTime();
      let idx = -1;
      for (let i = 0; i < transcript.length; i++) {
        if (t >= transcript[i].start) idx = i;
      }
      setActiveIndex((prev) => (prev === idx ? prev : idx));
    }, 300);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript]);

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIndex]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setRecordingUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());

        setIsUploading(true);
        const formData = new FormData();
        formData.set("audio", blob, "recording.webm");
        try {
          await uploadRecordingAction(clipId, formData);
          router.refresh();
          toast.success("Recording saved to your history");
        } catch {
          toast.error("Couldn't save that recording.");
        } finally {
          setIsUploading(false);
        }
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      toast.error("Couldn't access your microphone.");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        {youtubeVideoId ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg border border-border bg-black">
            <div ref={containerRef} className="h-full w-full" />
          </div>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-4 rounded-lg border border-border bg-muted p-6">
            <audio ref={sourceAudioRef} src={audioUrl ?? undefined} controls className="w-full" />
          </div>
        )}

        <Card className="mt-4">
          <CardContent className="flex items-center gap-3 py-4">
            {!isRecording ? (
              <Button onClick={startRecording} variant="outline" className="gap-2">
                <Mic className="h-4 w-4" />
                Record yourself
              </Button>
            ) : (
              <Button onClick={stopRecording} variant="destructive" className="gap-2">
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}
            {recordingUrl && (
              <RecordingPlayback key={recordingUrl} src={recordingUrl} />
            )}
            {isUploading && (
              <span className="text-sm text-muted-foreground">Saving…</span>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="lg:col-span-2">
        <CardContent className="flex max-h-[32rem] flex-col gap-3 overflow-y-auto py-4">
          <div className="sticky top-0 z-10 -mt-1 flex items-center justify-between bg-card pt-1">
            <p className="text-xs font-medium text-muted-foreground">Transcript</p>
            <EditTranscriptDialog
              clipId={clipId}
              startSeconds={startSeconds}
              transcript={transcript}
            />
          </div>
          {transcript.length === 0 ? (
            <RecordingHistory clipId={clipId} recordings={recordings} />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {transcript.map((line, i) => (
                  <button
                    key={i}
                    ref={i === activeIndex ? activeLineRef : undefined}
                    onClick={() => seekTo(line.start)}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-sm leading-relaxed transition-colors",
                      i === activeIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    {line.text.split(/(\s+)/).map((word, wi) =>
                      word.trim() ? (
                        <WordTapper
                          key={wi}
                          word={word}
                          context={line.text}
                          clipId={clipId}
                          aiEnabled={hasAiKey}
                        />
                      ) : (
                        <span key={wi}>{word}</span>
                      ),
                    )}
                  </button>
                ))}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <RecordingHistory clipId={clipId} recordings={recordings} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function WordTapper({
  word,
  context,
  clipId,
  aiEnabled,
}: {
  word: string;
  context: string;
  clipId: string;
  aiEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(() => normalizeFrenchWord(word) || word);
  const [saving, setSaving] = useState(false);
  const lookup = useWordLookup(value, context, open, aiEnabled);

  async function save() {
    setSaving(true);
    await addVocabularyAction({
      word: value,
      context,
      clipId,
      translation: buildTranslation(lookup),
    });
    setSaving(false);
    setOpen(false);
    toast.success(`Saved "${value}"`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="cursor-pointer rounded px-0.5 hover:bg-primary/20"
        >
          {word}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="max-h-[70vh] w-80 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-3">
          <WordDefinition lookup={lookup} word={value} />
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">Save to your vocabulary list</p>
            <Input value={value} onChange={(e) => setValue(e.target.value)} />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save word"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type WordLookup = {
  entry: DictionaryResult | null;
  status: "idle" | "loading" | "done" | "missing" | "error";
  ai: string | null;
  aiStatus: "off" | "idle" | "loading" | "done" | "error";
  requestAi: () => void;
};

/**
 * Looks the tapped word up on Wiktionary. The Chinese gloss costs an AI
 * round-trip, so it is only fetched when the learner asks for it — the
 * dictionary entry itself should appear as soon as the popover opens.
 * Results carry the word they belong to, so a result that hasn't caught up
 * with an edited word still reads as "loading".
 */
function useWordLookup(
  word: string,
  context: string,
  open: boolean,
  aiKeyConfigured: boolean,
): WordLookup {
  const query = word.trim();
  const [result, setResult] = useState<{
    word: string;
    entry: DictionaryResult | null;
    status: "done" | "missing" | "error";
  } | null>(null);
  const [aiResult, setAiResult] = useState<{
    word: string;
    text: string | null;
    status: "loading" | "done" | "error";
  } | null>(null);

  useEffect(() => {
    if (!open || !query) return;

    const controller = new AbortController();
    fetch(`/api/dictionary?word=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then(async (res) => {
        if (res.status === 404) {
          setResult({ word: query, entry: null, status: "missing" });
          return;
        }
        if (!res.ok) throw new Error(String(res.status));
        const entry = (await res.json()) as DictionaryResult;
        setResult({ word: query, entry, status: "done" });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setResult({ word: query, entry: null, status: "error" });
      });

    return () => controller.abort();
  }, [open, query]);

  const settings = aiKeyConfigured ? loadAiSettings() : null;
  const aiEnabled = !!settings?.apiKey;

  function requestAi() {
    if (!query || !settings?.apiKey) return;
    setAiResult({ word: query, text: null, status: "loading" });

    fetch("/api/dictionary/explain", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ai-provider": settings.provider,
        "x-ai-key": settings.apiKey,
        "x-ai-model": settings.model,
      },
      body: JSON.stringify({ word: query, context }),
    })
      .then(async (res) => {
        const json = (await res.json()) as { text?: string; error?: string };
        if (!res.ok || !json.text) throw new Error(json.error ?? "AI lookup failed");
        setAiResult({ word: query, text: json.text, status: "done" });
      })
      .catch((err) => {
        console.error(err);
        setAiResult({ word: query, text: null, status: "error" });
      });
  }

  const current = result?.word === query ? result : null;
  const currentAi = aiResult?.word === query ? aiResult : null;

  return {
    entry: current?.entry ?? null,
    status: !open || !query ? "idle" : (current?.status ?? "loading"),
    ai: currentAi?.text ?? null,
    aiStatus: !aiEnabled ? "off" : (currentAi?.status ?? "idle"),
    requestAi,
  };
}

function WordDefinition({ lookup, word }: { lookup: WordLookup; word: string }) {
  const { entry, status, ai, aiStatus, requestAi } = lookup;
  const headword = entry?.lemma ?? entry?.query ?? word;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{headword}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 text-muted-foreground"
          onClick={() => speak(headword)}
          aria-label={`Pronounce ${headword}`}
        >
          <Volume2 className="h-3.5 w-3.5" />
        </Button>
        {entry?.lemma && word !== entry.lemma && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 text-muted-foreground"
            onClick={() => speak(word)}
            aria-label={`Pronounce ${word} as written`}
            title={`Pronounce "${word}"`}
          >
            <Volume1 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {status === "loading" && (
        <p className="text-xs text-muted-foreground">Looking the word up…</p>
      )}

      {status === "missing" && (
        <p className="text-xs text-muted-foreground">
          No dictionary entry found for this word.
        </p>
      )}

      {status === "error" && (
        <p className="text-xs text-muted-foreground">Couldn&apos;t reach the dictionary.</p>
      )}

      {entry && (
        <>
          {entry.inflectionNote && (
            <p className="text-xs text-muted-foreground">{entry.inflectionNote}</p>
          )}
          {entry.senses.map((sense, i) => (
            <div key={i} className="flex flex-col gap-0.5">
              <p className="text-xs font-medium text-muted-foreground">{sense.partOfSpeech}</p>
              <ol className="ml-4 list-decimal text-sm">
                {sense.definitions.map((definition, j) => (
                  <li key={j}>{definition}</li>
                ))}
              </ol>
            </div>
          ))}
          <a
            href={entry.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground underline underline-offset-2"
          >
            Wiktionary
          </a>
        </>
      )}

      {aiStatus === "idle" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 self-start px-2 text-xs text-muted-foreground"
          onClick={requestAi}
        >
          <Languages className="h-3.5 w-3.5" />
          中文解释
        </Button>
      )}
      {aiStatus === "loading" && (
        <p className="text-xs text-muted-foreground">正在生成中文解释…</p>
      )}
      {aiStatus === "error" && (
        <p className="text-xs text-muted-foreground">中文解释生成失败。</p>
      )}
      {ai && <p className="whitespace-pre-line border-t border-border pt-2 text-sm">{ai}</p>}
    </div>
  );
}

/** What gets stored on the vocabulary entry (and pushed to the Anki card's back). */
function buildTranslation(lookup: WordLookup): string | undefined {
  if (lookup.ai) return lookup.ai;
  const entry = lookup.entry;
  if (!entry) return undefined;
  const senses = entry.senses
    .map((sense) => `${sense.partOfSpeech}: ${sense.definitions.join("; ")}`)
    .join("\n");
  const header = entry.lemma ? `${entry.lemma} — ${entry.inflectionNote ?? ""}`.trim() : "";
  return [header, senses].filter(Boolean).join("\n") || undefined;
}

function EditTranscriptDialog({
  clipId,
  startSeconds,
  transcript,
}: {
  clipId: string;
  startSeconds: number;
  transcript: TranscriptLine[];
}) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const initialText = transcript.map((line) => line.text).join("\n");

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      try {
        await updateTranscriptAction(clipId, formData);
        router.refresh();
        toast.success("Transcript saved");
        setOpen(false);
      } catch {
        toast.error("Couldn't save the transcript.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
          <Pencil className="h-3.5 w-3.5" />
          {transcript.length ? "Edit" : "Add transcript"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form action={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{transcript.length ? "Edit transcript" : "Add transcript"}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <input type="hidden" name="startSeconds" value={startSeconds} />
            <Textarea
              name="transcript"
              defaultValue={initialText}
              placeholder="One line per sentence…"
              className="min-h-56"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecordingHistory({
  clipId,
  recordings,
}: {
  clipId: string;
  recordings: Recording[];
}) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await deleteRecordingAction(id, clipId);
      router.refresh();
    } catch {
      toast.error("Couldn't delete that recording.");
    } finally {
      setDeletingId(null);
    }
  }

  if (recordings.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Record yourself with the button on the left — your recordings will show up here so you can
        play them back or delete the ones you don&apos;t want.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Your recording history</p>
      {recordings.map((recording) => (
        <div
          key={recording.id}
          className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
        >
          <RecordingPlayback src={recording.url} label={formatDate(recording.createdAt)} />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={deletingId === recording.id}
            onClick={() => handleDelete(recording.id)}
            aria-label="Delete recording"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function RecordingPlayback({ src, label = "Your recording" }: { src: string; label?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        size="icon"
        variant="ghost"
        className="shrink-0"
        onClick={() => {
          if (playing) {
            audioRef.current?.pause();
          } else {
            audioRef.current?.play();
          }
        }}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <span className="truncate text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
