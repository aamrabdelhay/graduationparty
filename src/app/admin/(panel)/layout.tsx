import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export default function AdminPanelLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
