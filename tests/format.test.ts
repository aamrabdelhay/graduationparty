import { describe, expect, it } from "vitest";
import { csvEscape, groupLabel, formatTimeHMSSec, pad } from "@/lib/format";
import { normalizeName, fullNameSchema } from "@/lib/validation";

describe("format helpers", () => {
  it("pads numbers", () => {
    expect(pad(7)).toBe("07");
    expect(pad(23)).toBe("23");
    expect(pad(4, 3)).toBe("004");
  });

  it("renders group labels like Group #014", () => {
    expect(groupLabel(14)).toBe("Group #014");
    expect(groupLabel(2)).toBe("Group #002");
    expect(groupLabel(1234)).toBe("Group #1234");
    expect(groupLabel(null)).toBe("—");
  });

  it("formats submission time with seconds", () => {
    const d = new Date("2026-09-04T23:41:07.123Z");
    const out = formatTimeHMSSec(d, "UTC");
    expect(out).toBe("23:41:07");
  });

  it("escapes CSV cells", () => {
    expect(csvEscape("Ahmed")).toBe("Ahmed");
    expect(csvEscape('Sara "Soso" Ali')).toBe('"Sara ""Soso"" Ali"');
    expect(csvEscape("One,Two")).toBe('"One,Two"');
  });
});

describe("name validation", () => {
  it("accepts Arabic and Latin full names", () => {
    expect(fullNameSchema.safeParse("أحمد محمد علي حسن").success).toBe(true);
    expect(fullNameSchema.safeParse("Ahmed Mohamed Ali Hassan").success).toBe(true);
    expect(fullNameSchema.safeParse("José María García").success).toBe(true);
    expect(fullNameSchema.safeParse("O'Connor Smith").success).toBe(true);
  });

  it("normalizes whitespace", () => {
    expect(normalizeName("  Ahmed   Mohamed  ")).toBe("Ahmed Mohamed");
  });

  it("rejects invalid names", () => {
    expect(fullNameSchema.safeParse("A").success).toBe(false);
    expect(fullNameSchema.safeParse("123 !!!").success).toBe(false);
    expect(fullNameSchema.safeParse("").success).toBe(false);
  });
});
