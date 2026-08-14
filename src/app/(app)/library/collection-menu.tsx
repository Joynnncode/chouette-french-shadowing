"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowDown, ArrowUp, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteCollectionAction,
  moveCollectionAction,
  renameCollectionAction,
} from "./actions";

export function CollectionMenu({
  collectionId,
  name,
  canMoveUp,
  canMoveDown,
}: {
  collectionId: string;
  name: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleRename(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await renameCollectionAction(collectionId, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success("Collection renamed");
      setRenaming(false);
    });
  }

  function handleMove(direction: "up" | "down") {
    startTransition(async () => {
      await moveCollectionAction(collectionId, direction);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteCollectionAction(collectionId);
        toast.success("Collection deleted");
      } catch {
        toast.error("Couldn't delete that collection.");
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`Options for ${name}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil className="h-4 w-4" />
            Rename…
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveUp} onSelect={() => handleMove("up")}>
            <ArrowUp className="h-4 w-4" />
            Move up
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onSelect={() => handleMove("down")}>
            <ArrowDown className="h-4 w-4" />
            Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(true)}>
            <Trash2 className="h-4 w-4" />
            Delete…
          </DropdownMenuItem>
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
            <DialogTitle>Rename collection</DialogTitle>
          </DialogHeader>
          <form action={handleRename}>
            <div className="flex flex-col gap-2 py-4">
              <Label htmlFor={`name-${collectionId}`}>Name</Label>
              <Input
                id={`name-${collectionId}`}
                name="name"
                defaultValue={name}
                autoFocus
                required
              />
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

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              The clips inside stay in your library — they just go back to sitting loose under
              their level.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
