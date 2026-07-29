"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Flame, Check } from "lucide-react";
import { toast } from "sonner";
import { checkInAction } from "./actions";

export function CheckInButton({ checkedIn }: { checkedIn: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="lg"
      variant={checkedIn ? "secondary" : "default"}
      disabled={checkedIn || isPending}
      onClick={() =>
        startTransition(async () => {
          await checkInAction();
          toast.success("Checked in for today. Keep it up!");
        })
      }
      className="gap-2"
    >
      {checkedIn ? <Check className="h-4 w-4" /> : <Flame className="h-4 w-4" />}
      {checkedIn ? "Checked in today" : "Check in today"}
    </Button>
  );
}
