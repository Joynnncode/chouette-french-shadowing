"use server";

import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { errorNotebookEntries } from "@/db/schema";

export async function addErrorEntryAction(input: {
  originalText: string;
  correction: string;
  explanation?: string;
}) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db.insert(errorNotebookEntries).values({
    userId: session.user.id,
    source: "ai_chat",
    originalText: input.originalText,
    correction: input.correction,
    explanation: input.explanation ?? null,
  });

  revalidatePath("/notebook");
}

export async function deleteErrorEntryAction(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db
    .delete(errorNotebookEntries)
    .where(and(eq(errorNotebookEntries.id, id), eq(errorNotebookEntries.userId, session.user.id)));

  revalidatePath("/notebook");
}

export async function getErrorEntries(userId: string) {
  return db.query.errorNotebookEntries.findMany({
    where: eq(errorNotebookEntries.userId, userId),
    orderBy: desc(errorNotebookEntries.createdAt),
  });
}
