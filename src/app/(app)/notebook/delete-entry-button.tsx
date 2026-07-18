"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { deleteErrorEntryAction } from "./actions";

export function DeleteEntryButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 shrink-0"
      disabled={isPending}
      onClick={() => startTransition(() => deleteErrorEntryAction(id))}
      aria-label="Delete entry"
    >
      <X className="h-4 w-4" />
    </Button>
  );
}
