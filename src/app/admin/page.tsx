import { redirect } from "next/navigation";
import { getSessionFromCookies } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminIndex() {
  const session = await getSessionFromCookies();
  redirect(session ? "/admin/dashboard" : "/admin/login");
}
