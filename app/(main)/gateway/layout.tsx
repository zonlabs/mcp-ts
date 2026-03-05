import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function GatewayLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect("/signin");
  }

  return <>{children}</>;
}

