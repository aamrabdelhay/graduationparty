import type { Metadata } from "next";
import PresentationRoom from "@/components/admin/PresentationRoom";

export const metadata: Metadata = { title: "Presentation control room" };

export default function PresentationPage() {
  return <PresentationRoom />;
}
