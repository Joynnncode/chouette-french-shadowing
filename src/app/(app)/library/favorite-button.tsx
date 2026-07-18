"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { toggleFavoriteAction } from "./actions";

export function FavoriteButton({
  clipId,
  isFavorited,
}: {
  clipId: string;
  isFavorited: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={isPending}
      onClick={() => startTransition(() => toggleFavoriteAction(clipId))}
      aria-label={isFavorited ? "Remove favorite" : "Add favorite"}
    >
      <Heart className={cn("h-4 w-4", isFavorited && "fill-primary text-primary")} />
    </Button>
  );
}
