import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { clips, collections, favorites } from "@/db/schema";

export type Level = "A1" | "A2" | "B1" | "B2";

/** Clips inside one collection, or the loose clips of one level. */
function groupFilter(collectionId: string | null, level: Level) {
  return collectionId
    ? eq(clips.collectionId, collectionId)
    : and(isNull(clips.collectionId), eq(clips.level, level));
}

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
      collectionId: clips.collectionId,
      durationSeconds: clips.durationSeconds,
      createdAt: clips.createdAt,
      favoriteCount: favCount,
      isFavorited,
    })
    .from(clips)
    .leftJoin(favorites, eq(favorites.clipId, clips.id))
    .where(level ? eq(clips.level, level as Level) : undefined)
    .groupBy(clips.id)
    .orderBy(asc(clips.position), desc(favCount), desc(clips.createdAt));

  return rows;
}

export type LibraryClip = Awaited<ReturnType<typeof getClips>>[number];

/**
 * The ids of one group in the exact order the library shows them — what a
 * move up/down has to reshuffle. Clips start life all at position 0, so the
 * favorites/recency tiebreak here has to match `getClips` or the first move
 * would jump a clip somewhere unexpected.
 */
export async function getOrderedClipIds(collectionId: string | null, level: Level) {
  const rows = await db
    .select({ id: clips.id })
    .from(clips)
    .leftJoin(favorites, eq(favorites.clipId, clips.id))
    .where(groupFilter(collectionId, level))
    .groupBy(clips.id)
    // Ordered by the aggregate itself, not by an alias — nothing selects it here.
    .orderBy(asc(clips.position), desc(sql`count(${favorites.userId})`), desc(clips.createdAt));

  return rows.map((row) => row.id);
}

export async function getCollections(level: string | null) {
  return db
    .select()
    .from(collections)
    .where(level ? eq(collections.level, level as Level) : undefined)
    .orderBy(asc(collections.level), asc(collections.position), asc(collections.createdAt));
}

export type Collection = Awaited<ReturnType<typeof getCollections>>[number];

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
