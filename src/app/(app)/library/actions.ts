"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { put } from "@vercel/blob";
import { auth } from "@/auth";
import { db } from "@/db";
import { clips, collections, favorites } from "@/db/schema";
import { getOrderedClipIds } from "@/lib/queries";
import {
  extractYoutubeVideoId,
  getTranscript,
  getVideoInfo,
  parseTimestamp,
} from "@/lib/youtube";
import { applyTimings, parseManualTranscript } from "@/lib/transcript";

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
    ? parseManualTranscript(manualTranscript, { startOffset: startSeconds })
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

export async function addAudioClipAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) {
    return { error: "Give the clip a title." };
  }

  const level = String(formData.get("level") ?? "") as "A1" | "A2" | "B1" | "B2";
  if (!["A1", "A2", "B1", "B2"].includes(level)) {
    return { error: "Pick a valid level." };
  }

  const channelName = String(formData.get("channelName") ?? "").trim() || null;

  const file = formData.get("audio");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an audio file to upload." };
  }
  if (!file.type.startsWith("audio/")) {
    return { error: "That file doesn't look like an audio file." };
  }

  const cover = formData.get("cover");
  const coverError = cover instanceof File && cover.size > 0 ? validateCover(cover) : null;
  if (coverError) return { error: coverError };

  const blob = await put(`clip-audio/${session.user.id}/${crypto.randomUUID()}`, file, {
    access: "public",
    contentType: file.type,
  });

  const coverUrl =
    cover instanceof File && cover.size > 0 ? await uploadCover(cover, session.user.id) : null;

  const manualTranscript = String(formData.get("transcript") ?? "").trim();
  const transcript = manualTranscript ? parseManualTranscript(manualTranscript) : null;

  await db.insert(clips).values({
    audioUrl: blob.url,
    coverUrl,
    title,
    channelName,
    level,
    transcript,
    addedByUserId: session.user.id,
  });

  revalidatePath("/library");
  return { error: null };
}

/** Cover art is decoration, so keep it small enough to never eat the upload budget. */
const MAX_COVER_BYTES = 8 * 1024 * 1024;

function validateCover(file: File): string | null {
  if (!file.type.startsWith("image/")) {
    return "That cover doesn't look like an image file.";
  }
  // The browser converts these before upload; if one still arrives it would
  // only render in Safari, so it's better to say so than to store a broken
  // image.
  if (/^image\/(heic|heif)/.test(file.type)) {
    return "Most browsers can't display HEIC. Save the photo as a JPEG and try again.";
  }
  if (file.size > MAX_COVER_BYTES) {
    return "That cover is bigger than 8 MB — pick a smaller image.";
  }
  return null;
}

async function uploadCover(file: File, userId: string) {
  const blob = await put(`clip-cover/${userId}/${crypto.randomUUID()}`, file, {
    access: "public",
    contentType: file.type,
  });
  return blob.url;
}

/** Sets (or replaces) the cover art on a clip that already exists. */
export async function updateClipCoverAction(clipId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const file = formData.get("cover");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an image to upload." };
  }
  const invalid = validateCover(file);
  if (invalid) return { error: invalid };

  const coverUrl = await uploadCover(file, session.user.id);
  await db.update(clips).set({ coverUrl }).where(eq(clips.id, clipId));

  revalidatePath("/library");
  revalidatePath(`/library/${clipId}`);
  return { error: null };
}

export async function removeClipCoverAction(clipId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db.update(clips).set({ coverUrl: null }).where(eq(clips.id, clipId));

  revalidatePath("/library");
  revalidatePath(`/library/${clipId}`);
}

export async function updateTranscriptAction(clipId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const raw = String(formData.get("transcript") ?? "").trim();
  const startSeconds = Number(formData.get("startSeconds") ?? 0) || 0;
  const transcript = raw ? parseManualTranscript(raw, { startOffset: startSeconds }) : null;

  await db.update(clips).set({ transcript }).where(eq(clips.id, clipId));

  revalidatePath(`/library/${clipId}`);
}

/**
 * Retries YouTube's captions for a clip that was added without a transcript —
 * the fetch is blocked often enough that it's worth a manual second go, and
 * auto-generated captions come with real timings, unlike a pasted transcript.
 */
export async function fetchCaptionsAction(clipId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip) return { error: "That clip is gone." };
  if (!clip.youtubeVideoId) return { error: "This clip isn't a YouTube video." };

  const transcript = await getTranscript(clip.youtubeVideoId).catch(() => null);
  if (!transcript?.length) {
    return { error: "YouTube didn't hand over captions for this video." };
  }

  await db.update(clips).set({ transcript }).where(eq(clips.id, clipId));
  revalidatePath(`/library/${clipId}`);
  return { error: null };
}

/**
 * Writes the real line start times captured by tapping along with the clip.
 * Only the timings travel from the client — the text stays whatever is already
 * stored, so a stale open tab can't rewrite the transcript.
 */
export async function updateTranscriptTimingsAction(clipId: string, starts: (number | null)[]) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip?.transcript?.length) throw new Error("This clip has no transcript to sync");
  if (starts.length !== clip.transcript.length) {
    throw new Error("The transcript changed while you were syncing — reload and try again");
  }

  await db
    .update(clips)
    .set({ transcript: applyTimings(clip.transcript, starts) })
    .where(eq(clips.id, clipId));

  revalidatePath(`/library/${clipId}`);
}

export async function renameClipAction(clipId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Give the clip a title." };
  if (title.length > 200) return { error: "That title is too long." };

  await db.update(clips).set({ title }).where(eq(clips.id, clipId));

  revalidatePath("/library");
  revalidatePath(`/library/${clipId}`);
  return { error: null };
}

export async function deleteClipAction(clipId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db.delete(clips).where(eq(clips.id, clipId));

  revalidatePath("/library");
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

// --- Collections ---

const LEVELS = ["A1", "A2", "B1", "B2"] as const;
type Level = (typeof LEVELS)[number];

function readName(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { name: null, error: "Give the collection a name." };
  if (name.length > 80) return { name: null, error: "That name is too long." };
  return { name, error: null };
}

/** Moves `id` one slot up or down in `ordered`, or null if it can't go further. */
function reorder(ordered: string[], id: string, direction: "up" | "down") {
  const from = ordered.indexOf(id);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ordered.length) return null;

  const next = [...ordered];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

export async function createCollectionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const { name, error } = readName(formData);
  if (error) return { error };

  const level = String(formData.get("level") ?? "") as Level;
  if (!LEVELS.includes(level)) return { error: "Pick a valid level." };

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${collections.position}), -1) + 1` })
    .from(collections)
    .where(eq(collections.level, level));

  await db
    .insert(collections)
    .values({ name: name!, level, position: next, createdByUserId: session.user.id });

  revalidatePath("/library");
  return { error: null };
}

export async function renameCollectionAction(collectionId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const { name, error } = readName(formData);
  if (error) return { error };

  await db.update(collections).set({ name: name! }).where(eq(collections.id, collectionId));

  revalidatePath("/library");
  return { error: null };
}

/** Deleting a collection keeps its clips — they fall back to loose under the level. */
export async function deleteCollectionAction(collectionId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db
    .update(clips)
    .set({ collectionId: null, position: 0 })
    .where(eq(clips.collectionId, collectionId));
  await db.delete(collections).where(eq(collections.id, collectionId));

  revalidatePath("/library");
}

export async function moveCollectionAction(collectionId: string, direction: "up" | "down") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const collection = await db.query.collections.findFirst({
    where: eq(collections.id, collectionId),
  });
  if (!collection) return;

  const siblings = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.level, collection.level))
    .orderBy(asc(collections.position), asc(collections.createdAt));

  const next = reorder(
    siblings.map((row) => row.id),
    collectionId,
    direction,
  );
  if (!next) return;

  await Promise.all(
    next.map((id, index) =>
      db.update(collections).set({ position: index }).where(eq(collections.id, id)),
    ),
  );

  revalidatePath("/library");
}

/**
 * Files a clip into a collection (or back out of one). A collection lives
 * under a single level, so joining one moves the clip to that level too.
 */
export async function setClipCollectionAction(clipId: string, collectionId: string | null) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip) return { error: "That clip is gone." };

  let level = clip.level;
  if (collectionId) {
    const collection = await db.query.collections.findFirst({
      where: eq(collections.id, collectionId),
    });
    if (!collection) return { error: "That collection is gone." };
    level = collection.level;
  }

  // Land at the end of whatever group it's joining.
  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${clips.position}), -1) + 1` })
    .from(clips)
    .where(
      collectionId
        ? eq(clips.collectionId, collectionId)
        : and(isNull(clips.collectionId), eq(clips.level, level)),
    );

  await db.update(clips).set({ collectionId, level, position: next }).where(eq(clips.id, clipId));

  revalidatePath("/library");
  revalidatePath(`/library/${clipId}`);
  return { error: null };
}

export async function moveClipAction(clipId: string, direction: "up" | "down") {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const clip = await db.query.clips.findFirst({ where: eq(clips.id, clipId) });
  if (!clip) return;

  const ordered = await getOrderedClipIds(clip.collectionId, clip.level);
  const next = reorder(ordered, clipId, direction);
  if (!next) return;

  // Untouched groups sit at position 0 across the board, so the whole group
  // gets renumbered on the first move rather than just the swapped pair.
  await Promise.all(
    next.map((id, index) => db.update(clips).set({ position: index }).where(eq(clips.id, id))),
  );

  revalidatePath("/library");
}
