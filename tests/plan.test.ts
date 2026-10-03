import { describe, expect, it } from "vitest";
import { extractOffline, parseDue, parseOwner } from "@/lib/meetings/extract";
import { groupByDay, monthGrid, monthKey, parseMonth, type CalItem } from "@/lib/calendar/grid";
import { score, targetYear, tokens, topHits } from "@/lib/memory/rank";
import { routeOffline } from "@/lib/copilot/router";
import { meetingSchema, memoryItemSchema } from "@/lib/validation/schemas";

const saturday = new Date(2026, 9, 3); // Sat 3 Oct 2026

describe("meeting intelligence (offline)", () => {
  it("works out deadlines relative to the meeting", () => {
    expect(parseDue("send it by Friday", saturday)).toBe("2026-10-09");
    expect(parseDue("by tomorrow", saturday)).toBe("2026-10-04");
    expect(parseDue("confirm by 10 Oct", saturday)).toBe("2026-10-10");
    expect(parseDue("by 15/11", saturday)).toBe("2026-11-15"); // day-first
    expect(parseDue("by end of month", saturday)).toBe("2026-10-31");
    expect(parseDue("by 2 Jan", saturday)).toBe("2027-01-02"); // already passed → next year
    expect(parseDue("soon", saturday)).toBeNull();
  });

  it("finds who owns an action", () => {
    expect(parseOwner("@Priya to send the deck")).toBe("Priya");
    expect(parseOwner("Arjun will confirm the DJ")).toBe("Arjun");
    expect(parseOwner("Update the menu (owner: Rohan)")).toBe("Rohan");
    expect(parseOwner("Rohan Mehta: book the hall")).toBe("Rohan Mehta");
    expect(parseOwner("book the hall")).toBeNull();
  });

  it("extracts decisions, actions and open questions", () => {
    const x = extractOffline(
      [
        "- Decided: ticket price stays at 800",
        "- Agreed to order 20% more food",
        "[00:12:30] Rohan: Can we get a sponsor for the photo booth?",
        "- Action: @Priya to send the sponsor deck by Friday",
        "- Arjun will confirm the DJ booking by 10 Oct",
        "- General chat about last year",
      ].join("\n"),
      saturday,
      "Planning",
    );
    expect(x.decisions).toEqual(["Ticket price stays at 800", "Order 20% more food"]);
    expect(x.actions).toEqual([
      { task: "Priya to send the sponsor deck by Friday", owner: "Priya", due: "2026-10-09" },
      { task: "Arjun will confirm the DJ booking by 10 Oct", owner: "Arjun", due: "2026-10-10" },
    ]);
    expect(x.questions).toEqual(["Can we get a sponsor for the photo booth?"]);
    expect(x.summary).toBe("Planning: 2 decisions, 2 action items, 1 open question.");
  });
});

describe("calendar", () => {
  it("builds Monday-first weeks covering the month", () => {
    const { weeks, from, to } = monthGrid(2026, 9); // October 2026 starts on a Thursday
    expect(from).toEqual(new Date(2026, 8, 28)); // Mon 28 Sep
    expect(weeks.every((w) => w.length === 7 && w[0].getDay() === 1)).toBe(true);
    expect(weeks.flat().some((d) => d.getMonth() === 9 && d.getDate() === 31)).toBe(true);
    expect(to).toEqual(new Date(2026, 10, 2)); // day after Sun 1 Nov
  });

  it("parses and steps months safely", () => {
    expect(parseMonth("2026-12")).toEqual({ year: 2026, month: 11 });
    expect(parseMonth("2026-13", saturday)).toEqual({ year: 2026, month: 9 });
    expect(monthKey(2026, 12)).toBe("2027-01");
    expect(monthKey(2026, -1)).toBe("2025-12");
  });

  it("groups items by day in time order", () => {
    const items: CalItem[] = [
      { id: "b", date: new Date(2026, 9, 5, 18), title: "B", kind: "event" },
      { id: "a", date: new Date(2026, 9, 5, 9), title: "A", kind: "deadline" },
    ];
    expect(
      groupByDay(items)
        .get("2026-9-5")!
        .map((i) => i.id),
    ).toEqual(["a", "b"]);
  });
});

describe("organization memory", () => {
  it("strips filler words and plurals", () => {
    expect(tokens("What happened during last year's Galas?")).toEqual(["gala"]);
  });

  it("understands which year is meant", () => {
    expect(targetYear("last year's gala", saturday)).toBe(2025);
    expect(targetYear("the 2024 hackathon")).toBe(2024);
    expect(targetYear("the gala")).toBeNull();
  });

  it("ranks title matches and the right year first", () => {
    const words = tokens("last year's gala");
    const now = saturday;
    const hits = [
      { id: "1", title: "Spring Gala 2026", text: "", date: new Date(2026, 2, 14) },
      { id: "2", title: "Diwali Gala Night 2025", text: "", date: new Date(2025, 10, 7) },
      { id: "3", title: "Food note", text: "the gala food ran out", date: new Date(2025, 10, 10) },
      { id: "4", title: "Hackathon", text: "power strips", date: new Date(2025, 7, 6) },
    ].map((h) => ({ ...h, source: "memory" as const, kind: "x", score: score(words, h, 2025, now) }));
    expect(topHits(hits).map((h) => h.id)).toEqual(["2", "3", "1"]);
  });

  it("routes history questions to memory with the full question", () => {
    expect(routeOffline("What happened during last year's Gala?")).toMatchObject({
      intent: "memory",
      subject: "What happened during last year's Gala?",
    });
  });
});

describe("validation", () => {
  it("needs real meeting notes", () => {
    expect(meetingSchema.safeParse({ title: "Sync", heldAt: "2026-10-03T17:00", notes: "short" }).success).toBe(false);
    expect(
      meetingSchema.safeParse({ title: "Sync", heldAt: "2026-10-03T17:00", notes: "Decided: we meet monthly from now on." }).success,
    ).toBe(true);
  });

  it("turns comma-separated tags into a list", () => {
    const r = memoryItemSchema.parse({ kind: "LESSON", title: "Book early", body: "Sound costs more late.", tags: "Gala, sound ,," });
    expect(r.tags).toEqual(["gala", "sound"]);
  });
});
