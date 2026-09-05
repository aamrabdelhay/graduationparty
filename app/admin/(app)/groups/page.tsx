import type { Metadata } from "next";
import GroupsView from "@/components/admin/GroupsView";

export const metadata: Metadata = { title: "المجموعات" };

export default function GroupsPage() {
  return <GroupsView />;
}
