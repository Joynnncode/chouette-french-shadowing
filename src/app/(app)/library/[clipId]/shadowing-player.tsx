"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
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
import { CoverImageError, prepareCoverImage } from "@/lib/image";
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
  Timer,
  Undo2,
  Download,
  AudioLines,
  ImagePlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { addVocabularyAction } from "../../vocabulary/actions";
import { uploadRecordingAction, deleteRecordingAction } from "./recordings-actions";
import {
  fetchCaptionsAction,
  removeClipCoverAction,
  updateTranscriptAction,
  updateTranscriptTimingsAction,
  updateClipCoverAction,
} from "../actions";

type TranscriptLine = { start: number; dur: number; text: string };
type Recording = { id: string; url: string; createdAt: Date };

/**
 * Taps land a moment after the line actually starts, so every tapped time is
 * pulled back by this much. Roughly the median human reaction time.
 */
const TAP_LATENCY_SECONDS = 0.25;

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
  coverUrl,
  transcript,
  startSeconds,
  recordings,
}: {
  clipId: string;
  youtubeVideoId: string | null;
  audioUrl: string | null;
  coverUrl: string | null;
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

  // Tap-along timing capture. `taps[i]` is the real start of line i, or null
  // while it hasn't been tapped yet; `cursor` is the line awaiting a tap.
  const [syncing, setSyncing] = useState(false);
  const [taps, setTaps] = useState<(number | null)[]>([]);
  const [cursor, setCursor] = useState(0);
  const [savingTimings, setSavingTimings] = useState(false);

  function getCurrentTime(): number {
    if (youtubeVideoId) return playerRef.current?.getCurrentTime() ?? 0;
    return sourceAudioRef.current?.currentTime ?? 0;
  }

  function play() {
    if (youtubeVideoId) playerRef.current?.playVideo();
    else sourceAudioRef.current?.play();
  }

  function pause() {
    if (youtubeVideoId) playerRef.current?.pauseVideo();
    else sourceAudioRef.current?.pause();
  }

  function seekTo(seconds: number) {
    if (youtubeVideoId) {
      playerRef.current?.seekTo(seconds, true);
      playerRef.current?.playVideo();
    } else if (sourceAudioRef.current) {
      sourceAudioRef.current.currentTime = seconds;
      sourceAudioRef.current.play();
    }
  }

  function startSync() {
    setTaps(Array(transcript.length).fill(null));
    setCursor(0);
    setSyncing(true);
    seekTo(startSeconds);
  }

  /** Stamps the playhead as the start of the line under the cursor. */
  function tap() {
    if (cursor >= transcript.length) return;
    const at = Math.max(0, getCurrentTime() - TAP_LATENCY_SECONDS);
    setTaps((prev) => prev.map((value, i) => (i === cursor ? at : value)));
    if (cursor + 1 >= transcript.length) pause();
    setCursor(cursor + 1);
  }

  /** Drops the last tap and rewinds there, so a mistimed line can be redone. */
  function undoTap() {
    if (cursor === 0) return;
    retapFrom(cursor - 1);
  }

  function retapFrom(index: number) {
    setTaps((prev) => prev.map((value, i) => (i >= index ? null : value)));
    setCursor(index);
    seekTo(taps[index - 1] ?? startSeconds);
  }

  async function saveTimings() {
    setSavingTimings(true);
    try {
      await updateTranscriptTimingsAction(clipId, taps);
      router.refresh();
      setSyncing(false);
      toast.success("Timings saved");
    } catch {
      toast.error("Couldn't save the timings.");
    } finally {
      setSavingTimings(false);
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

  // While syncing, the cursor leads the transcript instead of the clock —
  // following the (still wrong) stored timings would fight the person tapping.
  useEffect(() => {
    if (!transcript.length || syncing) return;
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
  }, [transcript, syncing]);

  useEffect(() => {
    if (!syncing) return;
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA)$/.test(target.tagName) || target.isContentEditable)) return;

      // Captured and cancelled before it reaches whatever button has focus:
      // Space would otherwise also activate that button, tapping twice or
      // hitting Save by accident.
      if (event.code === "Space") {
        event.preventDefault();
        event.stopPropagation();
        tap();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        event.stopPropagation();
        undoTap();
      } else if (event.key === "Escape") {
        setSyncing(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncing, cursor, taps]);

  const highlightIndex = syncing ? cursor : activeIndex;

  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlightIndex]);

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
          <div
            className={cn(
              "relative flex aspect-video w-full flex-col items-center gap-4 overflow-hidden rounded-lg border border-border bg-muted p-6",
              // Sat over the middle of the artwork, the controls cover the
              // part of a photo people actually framed.
              coverUrl ? "justify-end" : "justify-center",
            )}
          >
            {coverUrl && (
              <Image
                src={coverUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 60vw, 100vw"
                className="object-cover"
              />
            )}
            <audio
              ref={sourceAudioRef}
              src={audioUrl ?? undefined}
              controls
              className={cn("relative w-full", coverUrl && "rounded-full bg-background/80")}
            />
            <CoverControls clipId={clipId} hasCover={!!coverUrl} />
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
          <div className="sticky top-0 z-10 -mt-1 flex flex-col gap-2 bg-card pt-1">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Transcript</p>
              {syncing ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setSyncing(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={saveTimings}
                    disabled={savingTimings || taps.every((tap) => tap === null)}
                  >
                    {savingTimings ? "Saving…" : "Save timings"}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  {youtubeVideoId && <FetchCaptionsButton clipId={clipId} />}
                  {audioUrl && (
                    <TranscribeButton clipId={clipId} hasTranscript={transcript.length > 0} />
                  )}
                  {transcript.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1.5 px-2 text-xs"
                      onClick={startSync}
                    >
                      <Timer className="h-3.5 w-3.5" />
                      Sync timings
                    </Button>
                  )}
                  <EditTranscriptDialog
                    clipId={clipId}
                    startSeconds={startSeconds}
                    transcript={transcript}
                  />
                </div>
              )}
            </div>
            {syncing && (
              <SyncBar
                cursor={cursor}
                total={transcript.length}
                onTap={tap}
                onUndo={undoTap}
                onPlay={play}
                onPause={pause}
              />
            )}
          </div>
          {transcript.length === 0 ? (
            <RecordingHistory clipId={clipId} recordings={recordings} />
          ) : (
            <>
              <div className="flex flex-col gap-1">
                {transcript.map((line, i) => (
                  <button
                    key={i}
                    ref={i === highlightIndex ? activeLineRef : undefined}
                    onClick={() => (syncing ? retapFrom(i) : seekTo(line.start))}
                    className={cn(
                      "rounded-md px-2 py-1.5 text-left text-sm leading-relaxed transition-colors",
                      i === highlightIndex
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                      syncing && i > cursor && "opacity-60",
                    )}
                  >
                    {syncing && (
                      <span className="mr-2 font-mono text-xs text-muted-foreground">
                        {taps[i] === null || taps[i] === undefined
                          ? "--:--"
                          : formatClock(taps[i] as number)}
                      </span>
                    )}
                    {/* Word popovers would swallow the click that re-taps a line. */}
                    {syncing
                      ? line.text
                      : line.text.split(/(\s+)/).map((word, wi) =>
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

/**
 * Cover art for an uploaded audio clip, which has no thumbnail of its own.
 * The picker sits over the artwork rather than in a dialog — swapping the
 * picture is a one-tap thing, and there's nothing else to fill in.
 */
function CoverControls({ clipId, hasCover }: { clipId: string; hasCover: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, startRemoving] = useTransition();

  async function upload(picked: File) {
    setIsUploading(true);
    try {
      const file = await prepareCoverImage(picked);
      const formData = new FormData();
      formData.set("cover", file);
      const result = await updateClipCoverAction(clipId, formData);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
      toast.success("Cover saved");
    } catch (err) {
      toast.error(
        err instanceof CoverImageError ? err.message : "Couldn't upload that cover.",
      );
    } finally {
      setIsUploading(false);
      // Lets the same file be picked again after a failure.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function remove() {
    startRemoving(async () => {
      try {
        await removeClipCoverAction(clipId);
        router.refresh();
        toast.success("Cover removed");
      } catch {
        toast.error("Couldn't remove the cover.");
      }
    });
  }

  return (
    <div className="absolute right-2 top-2 flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }}
      />
      <Button
        variant="secondary"
        size="sm"
        className="h-7 gap-1.5 px-2 text-xs shadow-sm"
        onClick={() => inputRef.current?.click()}
        disabled={isUploading}
      >
        <ImagePlus className="h-3.5 w-3.5" />
        {isUploading ? "Uploading…" : hasCover ? "Change cover" : "Add cover"}
      </Button>
      {hasCover && (
        <Button
          variant="secondary"
          size="icon"
          className="h-7 w-7 shadow-sm"
          onClick={remove}
          disabled={isRemoving}
          aria-label="Remove cover"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

/**
 * Transcribes an uploaded audio clip with whichever provider the learner has
 * configured — Gemini or Whisper. Their own key does the work, same as the
 * Chinese gloss, so it stays opt-in and never runs on its own.
 */
function TranscribeButton({ clipId, hasTranscript }: { clipId: string; hasTranscript: boolean }) {
  const router = useRouter();
  const [isTranscribing, setIsTranscribing] = useState(false);

  async function transcribe() {
    const settings = loadAiSettings();
    if (!settings?.apiKey) {
      toast.error("Add an API key in AI settings first.");
      return;
    }

    setIsTranscribing(true);
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-provider": settings.provider,
          "x-ai-key": settings.apiKey,
          "x-ai-model": settings.model,
        },
        body: JSON.stringify({ clipId }),
      });
      const json = (await res.json()) as { lines?: number; provider?: string; error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "The transcription failed.");
        return;
      }
      router.refresh();
      toast.success(`Transcribed ${json.lines} lines`, {
        description:
          json.provider === "gemini"
            ? "Gemini's timings are approximate — use Sync timings if the highlight drifts."
            : "Whisper's timings are real — tap a line to jump straight there.",
      });
    } catch {
      toast.error("Couldn't reach the transcription service.");
    } finally {
      setIsTranscribing(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={transcribe}
      disabled={isTranscribing}
      title={hasTranscript ? "Replaces the current transcript" : undefined}
    >
      <AudioLines className="h-3.5 w-3.5" />
      {isTranscribing ? "Transcribing…" : "Transcribe"}
    </Button>
  );
}

/**
 * Retries YouTube's own captions. Worth offering on every YouTube clip: the
 * fetch is blocked often enough that the first attempt at add-time regularly
 * comes back empty, and captions arrive with real timings.
 */
function FetchCaptionsButton({ clipId }: { clipId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function fetchCaptions() {
    startTransition(async () => {
      try {
        const result = await fetchCaptionsAction(clipId);
        if (result?.error) {
          toast.error(result.error, {
            description: "Open the video on YouTube, click ⋯ → Show transcript, copy it, and paste it in with Edit — the timestamps come across too.",
          });
          return;
        }
        router.refresh();
        toast.success("Captions loaded from YouTube");
      } catch {
        toast.error("Couldn't reach YouTube.");
      }
    });
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      onClick={fetchCaptions}
      disabled={isPending}
    >
      <Download className="h-3.5 w-3.5" />
      {isPending ? "Fetching…" : "Fetch captions"}
    </Button>
  );
}

/** mm:ss.s — precise enough to see a tap land, short enough to sit inline. */
function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, "0")}`;
}

/**
 * The controls for a tap-along pass. Space is the primary input, but a
 * YouTube iframe eats key events once it has focus, so the same action is
 * always one click away here.
 */
function SyncBar({
  cursor,
  total,
  onTap,
  onUndo,
  onPlay,
  onPause,
}: {
  cursor: number;
  total: number;
  onTap: () => void;
  onUndo: () => void;
  onPlay: () => void;
  onPause: () => void;
}) {
  const done = cursor >= total;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-primary/40 bg-primary/5 p-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {done ? "All lines timed" : `Line ${cursor + 1} of ${total}`}
        </span>
        <span className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPlay}>
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPause}>
            <Pause className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" className="h-8 flex-1 text-xs" onClick={onTap} disabled={done}>
          {done ? "Done — save the timings" : "Tap when this line starts (Space)"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={onUndo}
          disabled={cursor === 0}
        >
          <Undo2 className="h-3.5 w-3.5" />
          Back
        </Button>
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Play the clip and tap as each line begins — Space to tap, ← to redo the last one, or click
        any line to start again from there. Untapped lines keep their estimated timing.
      </p>
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
          <div className="flex flex-col gap-2 py-4">
            <input type="hidden" name="startSeconds" value={startSeconds} />
            <Textarea
              name="transcript"
              defaultValue={initialText}
              placeholder="Paste the transcript — we split it into sentences on save…"
              className="min-h-56"
            />
            <p className="text-xs leading-snug text-muted-foreground">
              On YouTube, open the video&apos;s ⋯ menu → <strong>Show transcript</strong>, select it
              all and paste it here: the timestamps come with it and become the real timings, so
              there&apos;s nothing left to sync. Plain text works too — .srt and .vtt files as well.
            </p>
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
