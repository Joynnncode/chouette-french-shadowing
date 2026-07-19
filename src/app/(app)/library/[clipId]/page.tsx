import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { getClipWithTranscript } from "@/lib/queries";
import { Badge } from "@/components/ui/badge";
import { Heart } from "lucide-react";
import { FavoriteButton } from "../favorite-button";
import { ShadowingPlayer } from "./shadowing-player";
import { getRecordingsForClip } from "./recordings-actions";

export default async function ClipPage({
  params,
}: {
  params: Promise<{ clipId: string }>;
}) {
  const { clipId } = await params;
  const session = await auth();
  const userId = session!.user!.id!;

  const clip = await getClipWithTranscript(clipId, userId);
  if (!clip) notFound();

  const recordings = await getRecordingsForClip(clip.id, userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <Badge variant="secondary" className="mb-2">
            {clip.level}
          </Badge>
          <h1 className="text-xl font-bold tracking-tight">{clip.title}</h1>
          {clip.channelName && (
            <p className="text-sm text-muted-foreground">{clip.channelName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <Heart className="h-4 w-4" />
            {clip.favoriteCount}
          </span>
          <FavoriteButton clipId={clip.id} isFavorited={clip.isFavorited} />
        </div>
      </div>

      <ShadowingPlayer
        clipId={clip.id}
        youtubeVideoId={clip.youtubeVideoId}
        audioUrl={clip.audioUrl}
        transcript={clip.transcript ?? []}
        startSeconds={clip.startSeconds}
        recordings={recordings}
      />
    </div>
  );
}
