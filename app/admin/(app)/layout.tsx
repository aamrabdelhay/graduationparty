import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getAdminSession } from "@/lib/auth/admin";
import AdminChrome from "@/components/admin/AdminChrome";

export const dynamic = "force-dynamic";

/** Protects every /admin page except /admin/login. */
export default async function AdminAppLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  return <AdminChrome>{children}</AdminChrome>;
}
