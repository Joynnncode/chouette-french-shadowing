"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Send, BookmarkPlus, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DEFAULT_MODELS, loadAiSettings, useHasAiKey } from "@/lib/ai-settings";
import { useSpeechRecognition, speak, stopSpeaking, isSpeechSynthesisSupported } from "@/lib/speech";
import { AiSettingsDialog } from "./ai-settings-dialog";
import { addErrorEntryAction } from "../notebook/actions";

type Correction = { wrong: string; right: string; note: string };

function parseCorrections(text: string): { prose: string; corrections: Correction[] } {
  const lines = text.split("\n");
  const corrections: Correction[] = [];
  const proseLines: string[] = [];
  const regex = /^CORRECTION\s*\|\s*wrong="([^"]*)"\s*\|\s*right="([^"]*)"\s*\|\s*note="([^"]*)"/;

  for (const line of lines) {
    const match = line.match(regex);
    if (match) {
      corrections.push({ wrong: match[1], right: match[2], note: match[3] });
    } else {
      proseLines.push(line);
    }
  }

  return { prose: proseLines.join("\n").trim(), corrections };
}

export default function PracticePage() {
  const hasKey = useHasAiKey();
  const [input, setInput] = useState("");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastSpokenIdRef = useRef<string | null>(null);
  const ttsSupported = isSpeechSynthesisSupported();

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      headers: () => {
        const settings = loadAiSettings();
        return {
          "x-ai-provider": settings?.provider ?? "anthropic",
          "x-ai-key": settings?.apiKey ?? "",
          "x-ai-model": settings?.model ?? DEFAULT_MODELS.anthropic,
        };
      },
    }),
  });

  function sendText(text: string) {
    if (!text.trim()) return;
    if (!hasKey) {
      toast.error("Add your AI API key first.");
      return;
    }
    sendMessage({ text: text.trim() });
    setInput("");
  }

  const {
    isListening,
    interimText,
    isSupported: micSupported,
    start: startListening,
    stop: stopListening,
  } = useSpeechRecognition({
    lang: "fr-FR",
    onFinalResult: sendText,
  });

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (!autoSpeak || status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant" || lastSpokenIdRef.current === last.id) return;
    lastSpokenIdRef.current = last.id;
    const text = last.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    const { prose } = parseCorrections(text);
    if (prose.trim()) speak(prose);
  }, [messages, status, autoSpeak]);

  useEffect(() => stopSpeaking, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendText(input);
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      stopSpeaking();
      startListening();
    }
  }

  async function saveCorrection(c: Correction) {
    await addErrorEntryAction({ originalText: c.wrong, correction: c.right, explanation: c.note });
    toast.success("Saved to error notebook");
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Practice</h1>
          <p className="text-sm text-muted-foreground">
            Speak in French using the mic, or type. Replies are read aloud. Mistakes get flagged so
            you can save them to your error notebook.
          </p>
        </div>
        <div className="flex items-center gap-1">
          {ttsSupported && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (autoSpeak) stopSpeaking();
                setAutoSpeak((v) => !v);
              }}
              aria-label={autoSpeak ? "Mute replies" : "Read replies aloud"}
              title={autoSpeak ? "Mute replies" : "Read replies aloud"}
            >
              {autoSpeak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
          )}
          <AiSettingsDialog />
        </div>
      </div>

      {!hasKey && (
        <Alert>
          <AlertDescription>
            Add your own Anthropic or OpenAI API key in AI settings to start chatting.
          </AlertDescription>
        </Alert>
      )}

      {!micSupported && (
        <Alert>
          <AlertDescription>
            Voice input isn&apos;t supported in this browser — try Chrome or Edge. You can still
            type below.
          </AlertDescription>
        </Alert>
      )}

      <Card className="flex flex-1 flex-col overflow-hidden">
        <CardContent className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
          {messages.length === 0 && (
            <p className="m-auto text-sm text-muted-foreground">
              Say bonjour to start practicing.
            </p>
          )}
          {messages.map((message) => {
            const text = message.parts
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("");
            const { prose, corrections } =
              message.role === "assistant"
                ? parseCorrections(text)
                : { prose: text, corrections: [] };

            return (
              <div
                key={message.id}
                className={cn(
                  "flex flex-col gap-2",
                  message.role === "user" ? "items-end" : "items-start",
                )}
              >
                <div
                  className={cn(
                    "flex max-w-[85%] items-end gap-1.5 rounded-2xl px-4 py-2 text-sm",
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-accent-foreground",
                  )}
                >
                  <span className="whitespace-pre-wrap">{prose}</span>
                  {message.role === "assistant" && ttsSupported && prose.trim() && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      onClick={() => speak(prose)}
                      aria-label="Play aloud"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                {corrections.map((c, i) => (
                  <Card key={i} className="max-w-[85%] border-primary/30">
                    <CardContent className="flex items-center justify-between gap-3 py-2 text-sm">
                      <div>
                        <span className="text-destructive line-through">{c.wrong}</span>
                        <span className="mx-1 text-muted-foreground">&rarr;</span>
                        <span className="font-medium text-primary">{c.right}</span>
                        <p className="text-xs text-muted-foreground">{c.note}</p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => saveCorrection(c)}
                        aria-label="Save to notebook"
                      >
                        <BookmarkPlus className="h-4 w-4" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            );
          })}
          <div ref={scrollRef} />
        </CardContent>
      </Card>

      {isListening && (
        <p className="-mb-2 text-sm text-muted-foreground italic">
          {interimText || "Listening…"}
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        {micSupported && (
          <Button
            type="button"
            variant={isListening ? "destructive" : "outline"}
            size="icon"
            disabled={!hasKey}
            onClick={toggleListening}
            aria-label={isListening ? "Stop listening" : "Speak"}
          >
            {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
        )}
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Écris en français..."
          className="min-h-11 flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <Button type="submit" size="icon" disabled={status !== "ready"}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
