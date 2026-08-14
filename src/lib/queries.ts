import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clips, favorites } from "@/db/schema";

export async function getClips(level: string | null, userId: string) {
  const favCount = sql<number>`count(${favorites.userId})`.as("fav_count");
  const isFavorited = sql<boolean>`bool_or(${favorites.userId} = ${userId})`.as(
    "is_favorited",
  );

  const rows = await db
    .select({
      id: clips.id,
      youtubeVideoId: clips.youtubeVideoId,
      audioUrl: clips.audioUrl,
      coverUrl: clips.coverUrl,
      title: clips.title,
      channelName: clips.channelName,
      level: clips.level,
      durationSeconds: clips.durationSeconds,
      createdAt: clips.createdAt,
      favoriteCount: favCount,
      isFavorited,
    })
    .from(clips)
    .leftJoin(favorites, eq(favorites.clipId, clips.id))
    .where(level ? eq(clips.level, level as "A1" | "A2" | "B1" | "B2") : undefined)
    .groupBy(clips.id)
    .orderBy(desc(favCount), desc(clips.createdAt));

  return rows;
}

export async function getClipWithTranscript(clipId: string, userId: string) {
  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip) return null;

  const fav = await db.query.favorites.findFirst({
    where: and(eq(favorites.userId, userId), eq(favorites.clipId, clipId)),
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(favorites)
    .where(eq(favorites.clipId, clipId));

  return { ...clip, isFavorited: !!fav, favoriteCount: Number(count) };
}
