"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { put, del } from "@vercel/blob";
import { auth } from "@/auth";
import { db } from "@/db";
import { recordings } from "@/db/schema";

export async function uploadRecordingAction(clipId: string, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const file = formData.get("audio");
  if (!(file instanceof File)) throw new Error("No audio file provided");

  const blob = await put(`recordings/${session.user.id}/${crypto.randomUUID()}.webm`, file, {
    access: "public",
    contentType: file.type || "audio/webm",
  });

  await db.insert(recordings).values({
    userId: session.user.id,
    clipId,
    url: blob.url,
  });

  revalidatePath(`/library/${clipId}`);
}

export async function getRecordingsForClip(clipId: string, userId: string) {
  return db.query.recordings.findMany({
    where: and(eq(recordings.clipId, clipId), eq(recordings.userId, userId)),
    orderBy: desc(recordings.createdAt),
  });
}

export async function deleteRecordingAction(id: string, clipId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const recording = await db.query.recordings.findFirst({
    where: and(eq(recordings.id, id), eq(recordings.userId, session.user.id)),
  });
  if (!recording) return;

  await del(recording.url).catch(() => null);
  await db.delete(recordings).where(eq(recordings.id, id));

  revalidatePath(`/library/${clipId}`);
}
