import { auth } from "@/auth";
import { getCheckInStats } from "./actions";
import { CheckInButton } from "./check-in-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Flame, Trophy, CalendarCheck } from "lucide-react";

export default async function ProgressPage() {
  const session = await auth();
  const userId = session!.user!.id!;
  const stats = await getCheckInStats(userId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Progress</h1>
          <p className="text-sm text-muted-foreground">
            Check in each day you practice to build your streak.
          </p>
        </div>
        <CheckInButton checkedIn={stats.todayCheckedIn} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Flame className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current streak
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {stats.currentStreak} {stats.currentStreak === 1 ? "day" : "days"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Trophy className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Longest streak
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {stats.longestStreak} {stats.longestStreak === 1 ? "day" : "days"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CalendarCheck className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total check-ins
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{stats.totalCheckIns}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Last 12 weeks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-flow-col grid-rows-7 gap-1 overflow-x-auto pb-2">
            {stats.recentDays.map((day) => (
              <Tooltip key={day.date}>
                <TooltipTrigger asChild>
                  <div
                    className={cn(
                      "h-3.5 w-3.5 rounded-sm",
                      day.checkedIn ? "bg-primary" : "bg-muted",
                    )}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {day.date} {day.checkedIn ? "— checked in" : "— no practice"}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
