import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Video, MessagesSquare, BookMarked, Layers, Feather } from "lucide-react";

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/library");
  }

  return (
    <main className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2 font-semibold">
          <Feather className="h-5 w-5 text-primary" />
          <span>Chouette</span>
        </div>
        <Button asChild>
          <Link href="/login">Sign in</Link>
        </Button>
      </header>

      <section className="mx-auto max-w-3xl px-4 pb-16 pt-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Learn French by <span className="text-primary">shadowing</span> real clips
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Practice with leveled YouTube clips from A1 to B2, chat with an AI tutor,
          and keep every new word and mistake in one place — synced to your own Anki deck.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/login">Get started — it&apos;s free</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-4 pb-24 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <Video className="h-6 w-6 text-primary" />
            <CardTitle className="text-base">Leveled clips</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A1–B2 YouTube clips, ranked by what the community favorites most.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Layers className="h-6 w-6 text-primary" />
            <CardTitle className="text-base">Synced shadowing</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Follow the transcript line by line, record yourself, and tap any word to save it.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <MessagesSquare className="h-6 w-6 text-primary" />
            <CardTitle className="text-base">AI conversation</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Practice speaking French with an AI tutor — mistakes go straight into your error notebook.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <BookMarked className="h-6 w-6 text-primary" />
            <CardTitle className="text-base">Anki sync</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Send new vocabulary straight to your own Anki deck with one click.
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
