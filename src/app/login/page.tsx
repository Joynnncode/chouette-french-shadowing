import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/library");
  }

  const hasGithub = !!process.env.AUTH_GITHUB_ID;
  const hasGoogle = !!process.env.AUTH_GOOGLE_ID;

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to start shadowing.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {hasGithub && (
            <form
              action={async () => {
                "use server";
                await signIn("github", { redirectTo: "/library" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full gap-2">
                <LogIn className="h-4 w-4" />
                Continue with GitHub
              </Button>
            </form>
          )}
          {hasGoogle && (
            <form
              action={async () => {
                "use server";
                await signIn("google", { redirectTo: "/library" });
              }}
            >
              <Button type="submit" variant="outline" className="w-full gap-2">
                Continue with Google
              </Button>
            </form>
          )}
          {!hasGithub && !hasGoogle && (
            <p className="text-center text-sm text-muted-foreground">
              No sign-in providers are configured yet. Add AUTH_GITHUB_ID /
              AUTH_GOOGLE_ID to your .env.local — see README.md.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
