"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, FolderInput, MoreHorizontal, Pencil } from "lucide-react";
import { toast } from "sonner";
import type { Collection } from "@/lib/queries";
import { moveClipAction, renameClipAction, setClipCollectionAction } from "./actions";

const NONE = "none";

export function ClipMenu({
  clipId,
  title,
  collectionId,
  collections,
  canMoveUp = false,
  canMoveDown = false,
  showMove = true,
}: {
  clipId: string;
  title: string;
  collectionId: string | null;
  collections: Collection[];
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  /** Ordering only means something in the library grid, not on a clip's page. */
  showMove?: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRename(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await renameClipAction(clipId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success("Title updated");
      setRenaming(false);
    });
  }

  function handleMove(direction: "up" | "down") {
    startTransition(async () => {
      await moveClipAction(clipId, direction);
    });
  }

  function handleCollection(value: string) {
    const next = value === NONE ? null : value;
    if (next === collectionId) return;
    startTransition(async () => {
      const result = await setClipCollectionAction(clipId, next);
      if (result?.error) {
        toast.error(result.error);
        return;
      }
      toast.success(next ? "Moved into the collection" : "Removed from its collection");
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={isPending} aria-label="Clip options">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        {/* Width defaults to the trigger, and the trigger is an icon button. */}
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="h-4 w-4" />
            Rename…
          </DropdownMenuItem>
          {showMove && (
            <>
              <DropdownMenuItem disabled={!canMoveUp} onSelect={() => handleMove("up")}>
                <ArrowUp className="h-4 w-4" />
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!canMoveDown} onSelect={() => handleMove("down")}>
                <ArrowDown className="h-4 w-4" />
                Move down
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="h-4 w-4" />
              Collection
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-w-64">
              <DropdownMenuRadioGroup
                value={collectionId ?? NONE}
                onValueChange={handleCollection}
              >
                <DropdownMenuRadioItem value={NONE}>No collection</DropdownMenuRadioItem>
                {collections.map((collection) => (
                  <DropdownMenuRadioItem key={collection.id} value={collection.id}>
                    {collection.level} · {collection.name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={renaming}
        onOpenChange={(next) => {
          setRenaming(next);
          if (!next) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename clip</DialogTitle>
          </DialogHeader>
          <form action={handleRename}>
            <div className="flex flex-col gap-2 py-4">
              <Label htmlFor={`title-${clipId}`}>Title</Label>
              <Input id={`title-${clipId}`} name="title" defaultValue={title} autoFocus required />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
