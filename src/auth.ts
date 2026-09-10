import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

// Deliberately NOT using allowDangerousEmailAccountLinking: a shared email
// address is not proof that the same person owns both logins, and linking on
// it merges two sign-ins into one account. Someone who wants both providers on
// one account has to say so, not have us guess.
const providers = [];
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub);
}
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  // Without prompt=select_account, Google silently reuses whichever account is
  // already signed in to the browser, so anyone with more than one Google
  // account has no way to pick — or to tell which one they just used.
  providers.push(
    Google({ authorization: { params: { prompt: "select_account" } } }),
  );
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "database" },
  pages: {
    // Sign-in failures already come back to /login?error=…; send the rest of
    // them there too, so nothing dead-ends on the stock Auth.js error page.
    signIn: "/login",
    error: "/login",
  },
});
