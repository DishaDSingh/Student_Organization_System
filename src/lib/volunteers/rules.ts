/**
 * Volunteer rules and Smart Volunteer Matching. Pure functions: the same
 * inputs always give the same ranking, and every score comes with the
 * reasons behind it — matching suggests, a person decides.
 */

export const SKILLS = [
  "Event setup",
  "Ticketing & check-in",
  "Crowd management",
  "First aid",
  "Photography",
  "Videography",
  "Graphic design",
  "Social media",
  "Writing",
  "Public speaking",
  "Sound & lights",
  "Cooking & baking",
  "Sales",
  "Accounting",
  "Logistics",
  "Tech support",
] as const;

export const INTERESTS = [
  "Galas & parties",
  "Cultural",
  "Tech",
  "Sports",
  "Charity",
  "Environment",
  "Workshops",
  "Alumni",
  "Food",
] as const;

export const SLOTS = [
  { key: "WEEKDAY_MORNING", label: "Weekday mornings" },
  { key: "WEEKDAY_AFTERNOON", label: "Weekday afternoons" },
  { key: "WEEKDAY_EVENING", label: "Weekday evenings" },
  { key: "WEEKEND_MORNING", label: "Weekend mornings" },
  { key: "WEEKEND_AFTERNOON", label: "Weekend afternoons" },
  { key: "WEEKEND_EVENING", label: "Weekend evenings" },
] as const;
export type SlotKey = (typeof SLOTS)[number]["key"];

/** Which availability slot a moment falls in (local time). */
export function slotFor(d: Date): SlotKey {
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const h = d.getHours();
  const part = h < 12 ? "MORNING" : h < 17 ? "AFTERNOON" : "EVENING";
  return `${weekend ? "WEEKEND" : "WEEKDAY"}_${part}` as SlotKey;
}

/** Event/fundraiser categories → the volunteer interests they appeal to. */
export const CATEGORY_INTERESTS: Record<string, string[]> = {
  Gala: ["Galas & parties"],
  Cultural: ["Cultural"],
  Workshop: ["Workshops"],
  Tech: ["Tech"],
  Sports: ["Sports"],
  Social: ["Galas & parties"],
  Talk: ["Workshops"],
  Fundraiser: ["Charity"],
  Charity: ["Charity"],
  Environment: ["Environment"],
  Food: ["Food"],
  Alumni: ["Alumni"],
};

export type MatchTarget = {
  requiredSkills: string[];
  /** Interests the work relates to (from the event/fundraiser category). */
  interests: string[];
  /** When the work happens; null for tasks without a fixed time. */
  when: Date | null;
  estimatedHours: number;
};

export type Candidate = {
  userId: string;
  name: string;
  skills: string[];
  interests: string[];
  availability: string[];
  maxHoursPerWeek: number;
  completedTasks: number;
  completedShifts: number;
  /** Hours already committed this week (open tasks + upcoming shifts). */
  committedHours: number;
  openTasks: number;
};

export type Match = { userId: string; name: string; score: number; reasons: { text: string; tone: "good" | "neutral" | "warn" }[] };

const WEIGHTS = { skills: 40, availability: 20, interests: 15, experience: 15, workload: 10 } as const;

export function scoreCandidate(t: MatchTarget, c: Candidate): Match {
  const reasons: Match["reasons"] = [];
  let score = 0;

  // Skills: share of required skills the volunteer has (full marks if none required).
  const have = t.requiredSkills.filter((s) => c.skills.includes(s));
  if (t.requiredSkills.length) {
    score += (have.length / t.requiredSkills.length) * WEIGHTS.skills;
    reasons.push(
      have.length
        ? {
            text: `Has ${have.length}/${t.requiredSkills.length} skills: ${have.join(", ")}`,
            tone: have.length === t.requiredSkills.length ? "good" : "neutral",
          }
        : { text: `Missing skills: ${t.requiredSkills.join(", ")}`, tone: "warn" },
    );
  } else {
    score += WEIGHTS.skills * 0.6;
  }

  // Availability: is the volunteer usually free in this slot?
  if (t.when) {
    const slot = slotFor(t.when);
    const label = SLOTS.find((s) => s.key === slot)!.label.toLowerCase();
    if (c.availability.includes(slot)) {
      score += WEIGHTS.availability;
      reasons.push({ text: `Usually free on ${label}`, tone: "good" });
    } else {
      reasons.push({ text: `Not usually free on ${label}`, tone: "warn" });
    }
  } else {
    score += WEIGHTS.availability * 0.5;
  }

  // Interests: does the work match what they enjoy?
  const liked = t.interests.filter((i) => c.interests.includes(i));
  if (liked.length) {
    score += WEIGHTS.interests;
    reasons.push({ text: `Interested in ${liked.join(", ")}`, tone: "good" });
  }

  // Experience: diminishing returns, so newcomers still get a fair shot.
  const done = c.completedTasks + c.completedShifts;
  score += Math.min(1, Math.log2(1 + done) / 4) * WEIGHTS.experience;
  reasons.push(
    done
      ? { text: `${done} past tasks/shifts completed`, tone: done >= 5 ? "good" : "neutral" }
      : { text: "New volunteer — good first opportunity", tone: "neutral" },
  );

  // Workload: prefer people with spare capacity this week; never overload.
  const spare = c.maxHoursPerWeek - c.committedHours;
  if (spare < t.estimatedHours) {
    score -= 45; // strong enough that a free person always outranks an overloaded one
    reasons.push({ text: `Overloaded — ${c.committedHours}h committed of ${c.maxHoursPerWeek}h/week`, tone: "warn" });
  } else {
    score += (spare / Math.max(1, c.maxHoursPerWeek)) * WEIGHTS.workload;
    reasons.push({
      text: c.openTasks ? `${c.openTasks} open task${c.openTasks > 1 ? "s" : ""}, ${spare}h free this week` : `${spare}h free this week`,
      tone: "neutral",
    });
  }

  return { userId: c.userId, name: c.name, score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

export function rankCandidates(t: MatchTarget, candidates: Candidate[], limit = 8) {
  return candidates
    .map((c) => scoreCandidate(t, c))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ─── Fundraisers ─────────────────────────────────────────────────────────────

export function fundraiserProgress(raisedPaise: number, goalPaise: number) {
  return goalPaise > 0 ? Math.min(100, Math.round((raisedPaise / goalPaise) * 100)) : 0;
}

export function isOverdue(t: { status: string; dueAt: Date | null }, now = new Date()) {
  return t.status !== "DONE" && !!t.dueAt && t.dueAt < now;
}

export const TASK_STATUS_LABEL = { TODO: "To do", IN_PROGRESS: "In progress", BLOCKED: "Blocked", DONE: "Done" } as const;
export const FUNDRAISER_CAUSES = ["Charity", "Environment", "Education", "Health", "Community", "Club funds"] as const;
