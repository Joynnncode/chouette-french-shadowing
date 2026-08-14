import { auth } from "@/auth";
import { getClips, getCollections } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LevelFilter } from "./level-filter";
import { AddClipDialog } from "./add-clip-dialog";
import { AddCollectionDialog } from "./add-collection-dialog";
import { CollectionMenu } from "./collection-menu";
import { ClipGrid, EmptyCollection } from "./clip-card";

const LEVELS = ["A1", "A2", "B1", "B2"] as const;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ level?: string }>;
}) {
  const { level } = await searchParams;
  const session = await auth();
  const userId = session!.user!.id!;

  const selectedLevel = level && LEVELS.includes(level as (typeof LEVELS)[number]) ? level : null;
  const [clips, collections, allCollections] = await Promise.all([
    getClips(selectedLevel, userId),
    getCollections(selectedLevel),
    // The "move to collection" menu offers every collection, not just the
    // ones visible under the current filter.
    selectedLevel ? getCollections(null) : Promise.resolve(null),
  ]);
  const menuCollections = allCollections ?? collections;

  // Clips outside any collection are ordered within their own level, so they
  // are listed per level rather than as one mixed run.
  const loose = LEVELS.map((lvl) => ({
    level: lvl,
    clips: clips.filter((clip) => !clip.collectionId && clip.level === lvl),
  })).filter((group) => group.clips.length > 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Leveled French clips, grouped into your own collections.
          </p>
        </div>
        <div className="flex gap-2">
          <AddCollectionDialog levels={LEVELS} defaultLevel={selectedLevel ?? "A1"} />
          <AddClipDialog />
        </div>
      </div>

      <LevelFilter levels={LEVELS} selected={selectedLevel} />

      {clips.length === 0 && collections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No clips yet{selectedLevel ? ` at ${selectedLevel}` : ""}. Add the first one to get
            started.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-8">
          {collections.map((collection) => {
            const inCollection = clips.filter((clip) => clip.collectionId === collection.id);
            // Up/down shuffles a collection among the others at its level, so
            // the ends are only "the ends" within that level's run.
            const sameLevel = collections.filter((c) => c.level === collection.level);
            const levelIndex = sameLevel.indexOf(collection);

            return (
              <section key={collection.id} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Badge variant="secondary">{collection.level}</Badge>
                  <h2 className="font-semibold tracking-tight">{collection.name}</h2>
                  <span className="text-sm text-muted-foreground">{inCollection.length}</span>
                  <div className="ml-auto">
                    <CollectionMenu
                      collectionId={collection.id}
                      name={collection.name}
                      canMoveUp={levelIndex > 0}
                      canMoveDown={levelIndex < sameLevel.length - 1}
                    />
                  </div>
                </div>
                {inCollection.length === 0 ? (
                  <EmptyCollection />
                ) : (
                  <ClipGrid clips={inCollection} collections={menuCollections} />
                )}
              </section>
            );
          })}

          {loose.map((group) => (
            <section key={group.level} className="flex flex-col gap-3">
              {collections.length > 0 && (
                <div className="flex items-center gap-2 border-b pb-2">
                  <Badge variant="outline">{group.level}</Badge>
                  <h2 className="font-semibold tracking-tight text-muted-foreground">
                    Not in a collection
                  </h2>
                  <span className="text-sm text-muted-foreground">{group.clips.length}</span>
                </div>
              )}
              <ClipGrid clips={group.clips} collections={menuCollections} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
