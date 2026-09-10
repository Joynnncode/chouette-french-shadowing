import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "@/db";
import { users, accounts, sessions, verificationTokens } from "@/db/schema";

// Both GitHub and Google hand us an email address they have already verified,
// so if someone signs in with Google after having signed up with GitHub (or the
// other way round), link the two to the one account instead of refusing with
// OAuthAccountNotLinked.
const providers = [];
if (process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub({ allowDangerousEmailAccountLinking: true }));
}
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
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
