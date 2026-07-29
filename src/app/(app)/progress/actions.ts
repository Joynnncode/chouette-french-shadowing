"use server";

import { revalidatePath } from "next/cache";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { checkIns } from "@/db/schema";

const DAY_MS = 24 * 60 * 60 * 1000;

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

function dayNumber(dateStr: string) {
  return Math.floor(new Date(`${dateStr}T00:00:00Z`).getTime() / DAY_MS);
}

export async function checkInAction() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");

  await db
    .insert(checkIns)
    .values({ userId: session.user.id, date: todayUTC() })
    .onConflictDoNothing();

  revalidatePath("/progress");
}

export async function getCheckInStats(userId: string) {
  const rows = await db.query.checkIns.findMany({
    where: eq(checkIns.userId, userId),
    orderBy: desc(checkIns.date),
  });

  const dates = rows.map((r) => r.date);
  const dateSet = new Set(dates);
  const today = todayUTC();
  const todayNum = dayNumber(today);

  // Current streak: consecutive days ending today or yesterday (a missed
  // today doesn't zero the streak until the day is actually over).
  let currentStreak = 0;
  if (dateSet.size > 0) {
    let cursor = dateSet.has(today) ? todayNum : todayNum - 1;
    while (dateSet.has(new Date(cursor * DAY_MS).toISOString().slice(0, 10))) {
      currentStreak++;
      cursor--;
    }
  }

  // Longest streak: scan the sorted day numbers for consecutive runs.
  const sortedDayNumbers = dates.map(dayNumber).sort((a, b) => a - b);
  let longestStreak = 0;
  let run = 0;
  for (let i = 0; i < sortedDayNumbers.length; i++) {
    if (i > 0 && sortedDayNumbers[i] === sortedDayNumbers[i - 1] + 1) {
      run++;
    } else {
      run = 1;
    }
    longestStreak = Math.max(longestStreak, run);
  }

  // Last 84 days (12 weeks), oldest first, for a contribution-style grid.
  const days = 84;
  const recentDays = Array.from({ length: days }, (_, i) => {
    const num = todayNum - (days - 1 - i);
    const dateStr = new Date(num * DAY_MS).toISOString().slice(0, 10);
    return { date: dateStr, checkedIn: dateSet.has(dateStr) };
  });

  return {
    todayCheckedIn: dateSet.has(today),
    currentStreak,
    longestStreak,
    totalCheckIns: dateSet.size,
    recentDays,
  };
}
