"use client";

import { useEffect } from "react";

export default function HomeTextOverrides() {
  useEffect(() => {
    const replaceText = () => {
      document.body.querySelectorAll("h1, p").forEach((element) => {
        if (element.textContent?.includes("وأخيرًا…")) {
          element.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              node.textContent = node.textContent.replace("وأخيرًا…", "أخيراً");
            }
          });
        }

        if (element.textContent?.includes("الذكاء الاصطناعي هيكسّبك قبعة")) {
          element.textContent =
            "ارفع صورتك وأنت صغير وصورتك دلوقتي عشان تظهر بالاسم على الشاشة في الحفلة";
        }
      });
    };

    replaceText();
  }, []);

  return null;
}
