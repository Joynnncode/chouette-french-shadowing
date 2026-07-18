import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Nav } from "@/components/nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Nav
        user={session.user}
        onSignOut={async () => {
          "use server";
          await signOut({ redirectTo: "/" });
        }}
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
