"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function LevelFilter({
  levels,
  selected,
}: {
  levels: readonly string[];
  selected: string | null;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/library"
        className={cn(
          "rounded-full border px-3 py-1 text-sm transition-colors",
          !selected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-border text-muted-foreground hover:bg-accent",
        )}
      >
        All levels
      </Link>
      {levels.map((level) => (
        <Link
          key={level}
          href={`/library?level=${level}`}
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            selected === level
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          {level}
        </Link>
      ))}
    </div>
  );
}
