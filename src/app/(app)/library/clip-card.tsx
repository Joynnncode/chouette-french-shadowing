import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart, Music } from "lucide-react";
import type { Collection, LibraryClip } from "@/lib/queries";
import { FavoriteButton } from "./favorite-button";
import { DeleteClipButton } from "./delete-clip-button";
import { ClipMenu } from "./clip-menu";

export function ClipCard({
  clip,
  collections,
  canMoveUp,
  canMoveDown,
}: {
  clip: LibraryClip;
  collections: Collection[];
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  return (
    <Card className="flex flex-col overflow-hidden pt-0">
      <Link href={`/library/${clip.id}`}>
        <div className="relative flex aspect-video w-full items-center justify-center bg-muted">
          {clip.coverUrl ? (
            <Image
              src={clip.coverUrl}
              alt={clip.title}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover"
            />
          ) : clip.youtubeVideoId ? (
            <Image
              src={`https://i.ytimg.com/vi/${clip.youtubeVideoId}/hqdefault.jpg`}
              alt={clip.title}
              fill
              className="object-cover"
            />
          ) : (
            <Music className="h-8 w-8 text-muted-foreground" />
          )}
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
        {clip.channelName && <p className="text-xs text-muted-foreground">{clip.channelName}</p>}
      </CardHeader>
      <CardFooter className="justify-between">
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          <Heart className="h-4 w-4" />
          {clip.favoriteCount}
        </span>
        <div className="flex items-center">
          <FavoriteButton clipId={clip.id} isFavorited={clip.isFavorited} />
          <ClipMenu
            clipId={clip.id}
            title={clip.title}
            level={clip.level}
            collectionId={clip.collectionId}
            collections={collections}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
          />
          <DeleteClipButton clipId={clip.id} />
        </div>
      </CardFooter>
    </Card>
  );
}

export function ClipGrid({
  clips,
  collections,
}: {
  clips: LibraryClip[];
  collections: Collection[];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {clips.map((clip, index) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          collections={collections}
          canMoveUp={index > 0}
          canMoveDown={index < clips.length - 1}
        />
      ))}
    </div>
  );
}

export function EmptyCollection() {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        Nothing here yet — open a clip&apos;s ⋯ menu and pick this collection.
      </CardContent>
    </Card>
  );
}
