import Link from "next/link";
import { Suspense } from "react";
import SuccessClient from "@/components/public/SuccessClient";

export const metadata = {
  title: "Submission received",
};

export const dynamic = "force-dynamic";

export default function SuccessPage() {
  return (
    <Suspense fallback={null}>
      <SuccessClient />
    </Suspense>
  );
}
