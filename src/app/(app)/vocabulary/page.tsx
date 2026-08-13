import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { vocabularyEntries } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { formatSenses, normalizeFrenchWord } from "@/lib/dictionary";
import { lookupFrenchWord } from "@/lib/wiktionary";
import { VocabularyList } from "./vocabulary-list";

/**
 * Words saved before definitions were stored — and words saved without an AI
 * key — have no translation of their own, so look them up here. Wiktionary
 * responses are cached for a month, making repeat visits essentially free.
 */
async function lookUpMissingDefinitions(words: string[]) {
  const unique = [...new Set(words.map(normalizeFrenchWord).filter(Boolean))];
  const definitions = new Map<string, string | null>();

  // A single word can cost several requests (each inflection hop is one), so
  // work through a long list a few at a time instead of flooding Wiktionary.
  const queue = [...unique];
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (let word = queue.shift(); word; word = queue.shift()) {
      const entry = await lookupFrenchWord(word).catch(() => null);
      if (!entry) {
        definitions.set(word, null);
        continue;
      }
      const header = entry.lemma ? `${entry.lemma} — ${entry.inflectionNote ?? ""}`.trim() : "";
      definitions.set(word, [header, ...formatSenses(entry.senses)].filter(Boolean).join("\n"));
    }
  });

  await Promise.all(workers);
  return definitions;
}

export default async function VocabularyPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const saved = await db.query.vocabularyEntries.findMany({
    where: eq(vocabularyEntries.userId, userId),
    orderBy: desc(vocabularyEntries.createdAt),
  });

  const definitions = await lookUpMissingDefinitions(
    saved.filter((entry) => !entry.translation).map((entry) => entry.word),
  );

  const entries = saved.map((entry) => ({
    ...entry,
    translation: entry.translation ?? definitions.get(normalizeFrenchWord(entry.word)) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vocabulary</h1>
        <p className="text-sm text-muted-foreground">
          Words you saved while shadowing. Sync them to your own Anki deck with AnkiConnect.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No words saved yet. Tap any word while shadowing a clip to save it here.
          </CardContent>
        </Card>
      ) : (
        <VocabularyList entries={entries} />
      )}
    </div>
  );
}
