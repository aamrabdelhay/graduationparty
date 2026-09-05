import type { Metadata } from "next";
import PresentationControlRoomV2 from "@/components/admin/PresentationControlRoomV2";

export const metadata: Metadata = { title: "Presentation control room" };

export default function PresentationPage() {
  return <PresentationControlRoomV2 />;
}
