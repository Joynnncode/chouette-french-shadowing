import { eq, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { vocabularyEntries } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { VocabularyList } from "./vocabulary-list";

export default async function VocabularyPage() {
  const session = await auth();
  const userId = session!.user!.id!;

  const entries = await db.query.vocabularyEntries.findMany({
    where: eq(vocabularyEntries.userId, userId),
    orderBy: desc(vocabularyEntries.createdAt),
  });

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
