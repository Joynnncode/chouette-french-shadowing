"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CoverImageError, prepareCoverImage } from "@/lib/image";
import { addClipAction, addAudioClipAction } from "./actions";

export function AddClipDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(action: (formData: FormData) => Promise<{ error: string | null }>) {
    return (formData: FormData) => {
      setError(null);
      startTransition(async () => {
        const picked = formData.get("cover");
        if (picked instanceof File && picked.size > 0) {
          try {
            formData.set("cover", await prepareCoverImage(picked));
          } catch (err) {
            setError(
              err instanceof CoverImageError ? err.message : "Couldn't read that cover image.",
            );
            return;
          }
        }

        const result = await action(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        toast.success("Clip added");
        setOpen(false);
      });
    };
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          Add clip
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a clip</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="youtube">
          <TabsList className="w-full">
            <TabsTrigger value="youtube" className="flex-1">
              YouTube video
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex-1">
              Upload audio
            </TabsTrigger>
          </TabsList>

          <TabsContent value="youtube">
            <form action={handleSubmit(addClipAction)}>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="url">YouTube URL</Label>
                  <Input
                    id="url"
                    name="url"
                    placeholder="https://www.youtube.com/watch?v=..."
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="level">CEFR level</Label>
                  <Select name="level" defaultValue="A1" required>
                    <SelectTrigger id="level" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A1">A1</SelectItem>
                      <SelectItem value="A2">A2</SelectItem>
                      <SelectItem value="B1">B1</SelectItem>
                      <SelectItem value="B2">B2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="startAt">Start at (optional)</Label>
                  <Input id="startAt" name="startAt" placeholder="e.g. 1:45 — skip past an intro" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="transcript">Transcript (optional)</Label>
                  <Textarea
                    id="transcript"
                    name="transcript"
                    placeholder={
                      "Leave this empty to try YouTube's captions first.\nOr paste your own — line breaks mid-sentence are fine, we split it into sentences."
                    }
                    className="min-h-28"
                  />
                  <p className="text-xs leading-snug text-muted-foreground">
                    Best paste: the video&apos;s ⋯ menu → <strong>Show transcript</strong>, select
                    all, paste here. The timestamps come across and become the real timings.
                  </p>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Adding…" : "Add clip"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="audio">
            <form action={handleSubmit(addAudioClipAction)}>
              <div className="flex flex-col gap-4 py-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" name="title" placeholder="e.g. Les Habitudes" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="channelName">Source (optional)</Label>
                  <Input
                    id="channelName"
                    name="channelName"
                    placeholder="e.g. The perfect French with Dylane"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="audioLevel">CEFR level</Label>
                  <Select name="level" defaultValue="A1" required>
                    <SelectTrigger id="audioLevel" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A1">A1</SelectItem>
                      <SelectItem value="A2">A2</SelectItem>
                      <SelectItem value="B1">B1</SelectItem>
                      <SelectItem value="B2">B2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="audio">Audio file</Label>
                  <Input id="audio" name="audio" type="file" accept="audio/*" required />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="cover">Cover image (optional)</Label>
                  <Input id="cover" name="cover" type="file" accept="image/*" />
                  <p className="text-xs leading-snug text-muted-foreground">
                    An audio clip has no thumbnail of its own — pick a picture from your computer
                    and it becomes the clip&apos;s cover. You can change it later.
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="audioTranscript">Transcript (optional)</Label>
                  <Textarea
                    id="audioTranscript"
                    name="transcript"
                    placeholder="Paste the French transcript here — we split it into sentences for you. This is what lets you tap words to save vocabulary."
                    className="min-h-28"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Uploading…" : "Add clip"}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
