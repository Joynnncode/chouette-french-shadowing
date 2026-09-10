import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogIn } from "lucide-react";

// Auth.js sends failures back here as ?error=<code>. Anything we don't have
// wording for falls back to the last line.
const errorMessages: Record<string, string> = {
  OAuthAccountNotLinked:
    "That email is already signed up with the other provider. Use the one you signed up with.",
  AccessDenied: "Google didn't let that account through. Try another account.",
  Verification: "That sign-in link has expired. Give it another go.",
  Configuration: "Sign-in isn't set up correctly on our side. Try again later.",
};

// A login tab left open from before can still submit after the person has
// signed in somewhere else. Auth.js would treat that as "signed-in user adds
// another login" and attach the provider to whoever holds the session — so a
// second Google account would silently land in the first account. Check the
// session at submit time, not just at render time.
async function startSignIn(provider: "github" | "google") {
  "use server";
  const session = await auth();
  if (session?.user) {
    redirect("/library");
  }
  await signIn(provider, { redirectTo: "/library" });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/library");
  }

  const { error } = await searchParams;
  const errorMessage = error
    ? (errorMessages[error] ?? "Something went wrong signing in. Please try again.")
    : null;

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
          {errorMessage && (
            <p
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {errorMessage}
            </p>
          )}
          {hasGithub && (
            <form action={startSignIn.bind(null, "github")}>
              <Button type="submit" variant="outline" className="w-full gap-2">
                <LogIn className="h-4 w-4" />
                Continue with GitHub
              </Button>
            </form>
          )}
          {hasGoogle && (
            <form action={startSignIn.bind(null, "google")}>
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
