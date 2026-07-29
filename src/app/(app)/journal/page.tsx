import { auth } from "@/auth";
import { getJournalEntries } from "./actions";
import { JournalComposer } from "./journal-composer";
import { DeleteJournalEntryButton } from "./delete-journal-entry-button";
import { Card, CardContent } from "@/components/ui/card";
import { AiSettingsDialog } from "@/components/ai-settings-dialog";

export default async function JournalPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const entries = await getJournalEntries(userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Journal</h1>
          <p className="text-sm text-muted-foreground">
            Write a short entry in French and get feedback plus corrections.
          </p>
        </div>
        <AiSettingsDialog />
      </div>

      <JournalComposer />

      {entries.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Past entries</h2>
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex flex-col gap-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="whitespace-pre-wrap text-sm">{entry.content}</p>
                  <DeleteJournalEntryButton id={entry.id} />
                </div>
                {entry.feedback && (
                  <p className="text-sm text-muted-foreground">{entry.feedback}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {entry.createdAt.toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
