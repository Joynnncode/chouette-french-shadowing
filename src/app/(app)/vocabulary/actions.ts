"use server";

import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { vocabularyEntries } from "@/db/schema";

export async function addVocabularyAction(input: {
  word: string;
  context?: string;
  clipId?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  const word = input.word.trim();
  if (!word) return;

  await db.insert(vocabularyEntries).values({
    userId: session.user.id,
    word,
    context: input.context ?? null,
    clipId: input.clipId ?? null,
  });

  revalidatePath("/vocabulary");
}

export async function deleteVocabularyAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db
    .delete(vocabularyEntries)
    .where(and(eq(vocabularyEntries.id, id), eq(vocabularyEntries.userId, session.user.id)));

  revalidatePath("/vocabulary");
}

export async function markSyncedAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db
    .update(vocabularyEntries)
    .set({ syncedToAnki: true })
    .where(and(eq(vocabularyEntries.id, id), eq(vocabularyEntries.userId, session.user.id)));

  revalidatePath("/vocabulary");
}
