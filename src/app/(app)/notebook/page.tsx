import { auth } from "@/auth";
import { getErrorEntries } from "./actions";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DeleteEntryButton } from "./delete-entry-button";

export default async function NotebookPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const entries = await getErrorEntries(userId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Error Notebook</h1>
        <p className="text-sm text-muted-foreground">
          Mistakes flagged during AI conversation practice.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No mistakes logged yet. They&apos;ll show up here after you practice in AI Practice.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="flex flex-col gap-2 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="line-through decoration-destructive">
                        {entry.originalText}
                      </Badge>
                      <span className="text-muted-foreground">&rarr;</span>
                      <Badge className="bg-primary text-primary-foreground">
                        {entry.correction}
                      </Badge>
                    </div>
                    {entry.explanation && (
                      <p className="text-sm text-muted-foreground">{entry.explanation}</p>
                    )}
                  </div>
                  <DeleteEntryButton id={entry.id} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
