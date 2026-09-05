import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import ArabicGuard from "@/components/ArabicGuard";

export const metadata: Metadata = { title: { default: "حفلة تخرج جامعة العاصمة", template: "%s · حفلة تخرج جامعة العاصمة" }, description: "منصة احتفال تخرج جامعة العاصمة — شارك ذكرياتك من الطفولة حتى التخرج." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ar" dir="rtl" className="h-full"><body className="min-h-full antialiased"><ArabicGuard/><a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:right-2 focus:z-[100] focus:rounded-lg focus:bg-[#18263A] focus:px-3 focus:py-2 focus:text-sm focus:text-white focus:shadow-lg">الانتقال إلى المحتوى</a>{children}</body></html>;
}
