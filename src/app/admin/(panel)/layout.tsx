import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getSessionFromCookies();
  if (!session) redirect("/admin/login");
  return <>{children}</>;
}
