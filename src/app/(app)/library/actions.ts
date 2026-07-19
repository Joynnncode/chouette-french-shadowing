"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { clips, favorites } from "@/db/schema";
import {
  extractYoutubeVideoId,
  getTranscript,
  getVideoInfo,
  parseManualTranscript,
  parseTimestamp,
} from "@/lib/youtube";

export async function addClipAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const url = String(formData.get("url") ?? "");
  const level = String(formData.get("level") ?? "") as "A1" | "A2" | "B1" | "B2";
  if (!["A1", "A2", "B1", "B2"].includes(level)) {
    return { error: "Pick a valid level." };
  }

  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    return { error: "That doesn't look like a valid YouTube URL." };
  }

  const info = await getVideoInfo(videoId);
  if (!info) {
    return { error: "Could not find that YouTube video." };
  }

  const rawStartAt = String(formData.get("startAt") ?? "").trim();
  const startSeconds = rawStartAt ? (parseTimestamp(rawStartAt) ?? 0) : 0;
  if (rawStartAt && parseTimestamp(rawStartAt) === null) {
    return { error: 'Start time should look like "1:45" or a number of seconds.' };
  }

  const manualTranscript = String(formData.get("transcript") ?? "").trim();
  const transcript = manualTranscript
    ? parseManualTranscript(manualTranscript, 4, startSeconds)
    : await getTranscript(videoId).catch(() => null);

  await db.insert(clips).values({
    youtubeVideoId: videoId,
    title: info.title,
    channelName: info.channelName,
    level,
    transcript,
    startSeconds,
    addedByUserId: session.user.id,
  });

  revalidatePath("/library");
  return { error: null };
}

export async function toggleFavoriteAction(clipId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  const userId = session.user.id;

  const existing = await db.query.favorites.findFirst({
    where: and(eq(favorites.userId, userId), eq(favorites.clipId, clipId)),
  });

  if (existing) {
    await db
      .delete(favorites)
      .where(and(eq(favorites.userId, userId), eq(favorites.clipId, clipId)));
  } else {
    await db.insert(favorites).values({ userId, clipId });
  }

  revalidatePath("/library");
  revalidatePath(`/library/${clipId}`);
}
