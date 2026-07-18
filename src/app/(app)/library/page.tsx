import Link from "next/link";
import Image from "next/image";
import { auth } from "@/auth";
import { getClips } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { LevelFilter } from "./level-filter";
import { AddClipDialog } from "./add-clip-dialog";
import { FavoriteButton } from "./favorite-button";

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
  const clips = await getClips(selectedLevel, userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Leveled French clips, sorted by favorites.
          </p>
        </div>
        <AddClipDialog />
      </div>

      <LevelFilter levels={LEVELS} selected={selectedLevel} />

      {clips.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No clips yet{selectedLevel ? ` at ${selectedLevel}` : ""}. Add the first one to get
            started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clips.map((clip) => (
            <Card key={clip.id} className="flex flex-col overflow-hidden pt-0">
              <Link href={`/library/${clip.id}`}>
                <div className="relative aspect-video w-full bg-muted">
                  <Image
                    src={`https://i.ytimg.com/vi/${clip.youtubeVideoId}/hqdefault.jpg`}
                    alt={clip.title}
                    fill
                    className="object-cover"
                  />
                </div>
              </Link>
              <CardHeader className="flex-1">
                <Badge variant="secondary" className="w-fit">
                  {clip.level}
                </Badge>
                <CardTitle className="line-clamp-2 text-base">
                  <Link href={`/library/${clip.id}`} className="hover:text-primary">
                    {clip.title}
                  </Link>
                </CardTitle>
                {clip.channelName && (
                  <p className="text-xs text-muted-foreground">{clip.channelName}</p>
                )}
              </CardHeader>
              <CardFooter className="justify-between">
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Heart className="h-4 w-4" />
                  {clip.favoriteCount}
                </span>
                <FavoriteButton clipId={clip.id} isFavorited={clip.isFavorited} />
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
