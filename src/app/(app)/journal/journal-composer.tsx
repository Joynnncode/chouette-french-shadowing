"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookmarkPlus, Send } from "lucide-react";
import { toast } from "sonner";
import { DEFAULT_MODELS, loadAiSettings, useHasAiKey } from "@/lib/ai-settings";
import { saveJournalEntryAction } from "./actions";
import { addErrorEntryAction } from "../notebook/actions";

type Correction = { wrong: string; right: string; note: string };

export function JournalComposer() {
  const hasKey = useHasAiKey();
  const [content, setContent] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [result, setResult] = useState<{ feedback: string; corrections: Correction[] } | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    if (!hasKey) {
      toast.error("Add your AI API key first.");
      return;
    }

    setIsPending(true);
    setResult(null);
    try {
      const settings = loadAiSettings();
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ai-provider": settings?.provider ?? "gemini",
          "x-ai-key": settings?.apiKey ?? "",
          "x-ai-model": settings?.model ?? DEFAULT_MODELS.gemini,
        },
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong talking to the AI.");

      setResult(data);
      await saveJournalEntryAction({ content, feedback: data.feedback });
      setContent("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong talking to the AI.");
    } finally {
      setIsPending(false);
    }
  }

  async function saveCorrection(c: Correction) {
    await addErrorEntryAction({
      originalText: c.wrong,
      correction: c.right,
      explanation: c.note,
      source: "journal",
    });
    toast.success("Saved to error notebook");
  }

  return (
    <div className="flex flex-col gap-4">
      {!hasKey && (
        <Alert>
          <AlertDescription>
            Add your own Anthropic or OpenAI API key in AI settings to get feedback.
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Écris quelques phrases sur ta journée..."
          className="min-h-32 resize-none"
        />
        <Button type="submit" disabled={isPending || !content.trim()} className="gap-2 self-end">
          <Send className="h-4 w-4" />
          {isPending ? "Getting feedback..." : "Get feedback"}
        </Button>
      </form>

      {result && (
        <Card>
          <CardContent className="flex flex-col gap-3 py-4">
            {result.feedback && <p className="text-sm">{result.feedback}</p>}
            {result.corrections.map((c, i) => (
              <Card key={i} className="border-primary/30">
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
