import { describe, expect, it } from "vitest";
import { draftAnnouncementSchema, publishAnnouncementSchema, saveAnnouncementSchema } from "@/lib/validation/schemas";
import { NAV } from "@/components/shell/nav";

describe("announcements: human in the loop", () => {
  it("needs a real brief and a known audience to draft", () => {
    expect(draftAnnouncementSchema.safeParse({ brief: "hi", audience: "MEMBERS" }).success).toBe(false);
    expect(draftAnnouncementSchema.safeParse({ brief: "Gala tickets are on sale now", audience: "EVERYONE_ON_EARTH" }).success).toBe(false);
    expect(draftAnnouncementSchema.parse({ brief: "Gala tickets are on sale now", audience: "MEMBERS" }).useAi).toBe(true);
  });

  it("publishing requires the confirmed recipient count", () => {
    expect(publishAnnouncementSchema.safeParse({ announcementId: "a1" }).success).toBe(false);
    expect(publishAnnouncementSchema.safeParse({ announcementId: "a1", confirmRecipients: 141 }).success).toBe(true);
  });

  it("validates edits", () => {
    expect(saveAnnouncementSchema.safeParse({ announcementId: "a", title: "Hi", body: "Too short", audience: "ALL" }).success).toBe(false);
  });
});

describe("navigation follows the three product layers", () => {
  it("groups modules into Operate, Understand and Anticipate", () => {
    const groups = Object.fromEntries(NAV.map((g) => [g.label, g.items.map((i) => i.href)]));
    expect(Object.keys(groups)).toEqual(["Home", "Operate", "Understand", "Anticipate", "Administration", "You"]);
    expect(groups.Understand).toEqual(["/insights", "/copilot", "/analytics", "/reports"]);
    expect(groups.Anticipate).toEqual(["/simulate", "/meetings", "/memory"]);
  });

  it("every nav link is unique", () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
