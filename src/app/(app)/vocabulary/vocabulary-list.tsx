"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Send, Trash2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { speak } from "@/lib/speech";
import { deleteVocabularyAction, markSyncedAction } from "./actions";

type VocabEntry = {
  id: string;
  word: string;
  context: string | null;
  translation: string | null;
  syncedToAnki: boolean;
  createdAt: Date;
};

const DECK_STORAGE_KEY = "chouette-anki-deck";

async function addNoteToAnki(deck: string, entry: VocabEntry) {
  const res = await fetch("http://127.0.0.1:8765", {
    method: "POST",
    body: JSON.stringify({
      action: "addNote",
      version: 6,
      params: {
        note: {
          deckName: deck,
          modelName: "Basic",
          fields: {
            Front: entry.word,
            Back: [entry.translation, entry.context].filter(Boolean).join("<br><br>"),
          },
          options: { allowDuplicate: false },
          tags: ["chouette", "french-shadowing"],
        },
      },
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error);
}

export function VocabularyList({ entries }: { entries: VocabEntry[] }) {
  const [deck, setDeck] = useState(
    typeof window !== "undefined"
      ? window.localStorage.getItem(DECK_STORAGE_KEY) ?? "Chouette French"
      : "Chouette French",
  );
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);

  function persistDeck(value: string) {
    setDeck(value);
    window.localStorage.setItem(DECK_STORAGE_KEY, value);
  }

  async function syncOne(entry: VocabEntry) {
    setSyncingId(entry.id);
    try {
      await addNoteToAnki(deck, entry);
      await markSyncedAction(entry.id);
      toast.success(`Sent "${entry.word}" to Anki`);
    } catch (err) {
      toast.error(
        "Couldn't reach Anki. Make sure Anki is open with the AnkiConnect add-on installed.",
      );
      console.error(err);
    } finally {
      setSyncingId(null);
    }
  }

  async function syncAll() {
    setSyncingAll(true);
    const unsynced = entries.filter((e) => !e.syncedToAnki);
    let count = 0;
    for (const entry of unsynced) {
      try {
        await addNoteToAnki(deck, entry);
        await markSyncedAction(entry.id);
        count++;
      } catch (err) {
        toast.error(
          "Couldn't reach Anki. Make sure Anki is open with the AnkiConnect add-on installed.",
        );
        console.error(err);
        break;
      }
    }
    if (count > 0) toast.success(`Sent ${count} word(s) to Anki`);
    setSyncingAll(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <span className="text-sm text-muted-foreground">Anki deck</span>
          <Input
            value={deck}
            onChange={(e) => persistDeck(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={syncAll} disabled={syncingAll} className="ml-auto gap-2">
            <Send className="h-4 w-4" />
            {syncingAll ? "Syncing…" : "Sync all unsynced"}
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium">{entry.word}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 text-muted-foreground"
                    onClick={() => speak(entry.word)}
                    aria-label={`Pronounce ${entry.word}`}
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                  </Button>
                  {entry.syncedToAnki && (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="h-3 w-3" />
                      Synced
                    </Badge>
                  )}
                </div>
                {entry.translation ? (
                  <p className="whitespace-pre-line text-sm">{entry.translation}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No definition found.</p>
                )}
                {entry.context && (
                  <p className="truncate text-xs text-muted-foreground">{entry.context}</p>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={syncingId === entry.id}
                  onClick={() => syncOne(entry)}
                  aria-label="Send to Anki"
                >
                  <Send className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteVocabularyAction(entry.id)}
                  aria-label="Delete word"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
