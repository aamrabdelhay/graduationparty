"use client";

import { useEffect } from "react";

const titleFrom = "وأخيرًا…";
const titleTo = "أخيراً";
const badgeFrom = "سجّل نفسك في ألبوم التخرج الرسمي";
const badgeTo = "سجل نفسك في ألبوم التخرج";
const subtitle = "لحظة العمر… على الشاشة الكبيرة";
const descriptionFrom = "ارفع صورتك وأنت صغير وصورتك دلوقتي، والذكاء الاصطناعي هيكسّبك قبعة التخرج — ولحظتك هتظهر بالاسم على شاشة الحفل قدام الكل.";
const descriptionTo = "ارفع صورتك وأنت صغير وصورتك دلوقتي عشان تظهر بالاسم على الشاشة في الحفلة";

export default function HomeTextOverrides() {
  useEffect(() => {
    const apply = () => {
      document.querySelectorAll("h1, p, span").forEach((element) => {
        const text = element.textContent ?? "";
        if (text.includes(titleFrom) || text === titleTo) {
          element.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              node.textContent = (node.textContent ?? "").replace(titleFrom, titleTo);
            }
          });
        }
        if (text.includes(badgeFrom)) element.textContent = badgeTo;
        if (
          text.includes(descriptionFrom) ||
          text.includes("الذكاء الاصطناعي هيكسّبك قبعة")
        ) {
          element.textContent = descriptionTo;
        }
        if (text === subtitle) element.remove();
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
