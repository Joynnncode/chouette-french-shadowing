"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { journalEntries } from "@/db/schema";

export async function saveJournalEntryAction(input: { content: string; feedback: string }) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db.insert(journalEntries).values({
    userId: session.user.id,
    content: input.content,
    feedback: input.feedback || null,
  });

  revalidatePath("/journal");
}

export async function deleteJournalEntryAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, session.user.id)));

  revalidatePath("/journal");
}

export async function getJournalEntries(userId: string) {
  return db.query.journalEntries.findMany({
    where: eq(journalEntries.userId, userId),
    orderBy: desc(journalEntries.createdAt),
  });
}
