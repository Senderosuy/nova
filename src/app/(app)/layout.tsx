import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { Nav } from "@/components/nav";
import { logout } from "./actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  const email = (data.claims.email as string) ?? "";

  return (
    <div className="min-h-screen bg-ink">
      <Nav email={email} logout={logout} />
      <main className="px-4 pb-10 pt-20 sm:px-6 lg:ml-56 lg:px-8 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
