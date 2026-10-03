/**
 * Meeting intelligence — offline extractor. Reads notes or a transcript and
 * pulls out decisions, action items (owner + deadline) and open questions
 * using the cues people actually write ("Decided:", "Action:", "@Priya",
 * "Rohan will … by Friday", "?"). Claude does this better when configured;
 * either way a person reviews everything before any task is created.
 */

export type ActionItem = { task: string; owner: string | null; due: string | null };
export type Extracted = { summary: string; decisions: string[]; actions: ActionItem[]; questions: string[] };

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** "by Friday", "by tomorrow", "by next week", "by 12 Oct", "by 12/10", "by end of month" → YYYY-MM-DD (relative to the meeting). */
export function parseDue(text: string, from: Date): string | null {
  const t = text.toLowerCase();
  const m = t.match(/\b(?:by|before|due|until|on)\s+(?:the\s+)?(.+?)(?:[.,;)]|$)/);
  if (!m) return null;
  const when = m[1].trim();
  if (/^(today|tonight|eod)\b/.test(when)) return iso(from);
  if (/^tomorrow\b/.test(when)) return iso(addDays(from, 1));
  if (/^(next week|end of (the )?week|eow)\b/.test(when)) return iso(addDays(from, 7 - from.getDay() || 7));
  if (/^(end of (the )?month|eom|month end)\b/.test(when)) return iso(new Date(from.getFullYear(), from.getMonth() + 1, 0));
  const day = DAYS.findIndex((d) => when.startsWith(d) || when.startsWith(`next ${d}`));
  if (day >= 0) {
    const ahead = (day - from.getDay() + 7) % 7 || 7;
    return iso(addDays(from, ahead));
  }
  let d = when.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3})/);
  if (d && MONTHS.includes(d[2])) return iso(rollForward(new Date(from.getFullYear(), MONTHS.indexOf(d[2]), Number(d[1])), from));
  d = when.match(/^([a-z]{3})[a-z]*\s+(\d{1,2})\b/);
  if (d && MONTHS.includes(d[1])) return iso(rollForward(new Date(from.getFullYear(), MONTHS.indexOf(d[1]), Number(d[2])), from));
  d = when.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/); // day-first, as written in India
  if (d) {
    const y = d[3] ? (d[3].length === 2 ? 2000 + Number(d[3]) : Number(d[3])) : from.getFullYear();
    const date = new Date(y, Number(d[2]) - 1, Number(d[1]));
    return iso(d[3] ? date : rollForward(date, from));
  }
  return null;
}

/** A date without a year that already passed means next year. */
const rollForward = (d: Date, from: Date) => (d < addDays(from, -1) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d);

const NAME = String.raw`([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)`;

/** Who owns an action: "@Priya …", "Priya: …", "Priya will …", "Priya to …", "… (owner: Priya)". */
export function parseOwner(line: string): string | null {
  return (
    line.match(/@([A-Za-z][\w.-]*(?:\s[A-Z][a-z]+)?)/)?.[1] ??
    line.match(/\(?owner[:\s]+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\)?/i)?.[1] ??
    line.match(new RegExp(`^${NAME}\\s*(?::|-|–)\\s`))?.[1] ??
    line.match(new RegExp(`^${NAME}\\s+(?:will|to|should|is going to|can)\\b`))?.[1] ??
    null
  );
}

const clean = (line: string) =>
  line
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "") // bullets / numbering
    .replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*/, "") // transcript timestamps
    .trim();

const DECISION =
  /^(?:decision|decided|agreed|resolved|final decision|outcome)\s*[:\-–]\s*|^(?:decided|agreed)\s+(?:to|that|on)\s+|^(?:we|the committee|everyone)\s+(?:decided|agreed)\s+(?:to|that|on)\s+|\b(?:it was|we've|we have)\s+(?:decided|agreed)\s+(?:to|that)\s+/i;
const ACTION = /^(?:action(?:\s*item)?|todo|to-do|task|ai|next step)\s*[:\-–]\s*/i;
const QUESTION = /^(?:open question|question|q|tbd|to be decided)\s*[:\-–]\s*/i;

export function extractOffline(notes: string, meetingDate: Date, title = "Meeting"): Extracted {
  const decisions: string[] = [];
  const actions: ActionItem[] = [];
  const questions: string[] = [];

  for (const raw of notes.split(/\r?\n/)) {
    const line = clean(raw);
    if (line.length < 4) continue;

    if (ACTION.test(line)) {
      const task = line.replace(ACTION, "");
      actions.push({ task: tidyTask(task), owner: parseOwner(task), due: parseDue(task, meetingDate) });
      continue;
    }
    if (DECISION.test(line)) {
      decisions.push(sentence(line.replace(DECISION, "")));
      continue;
    }
    if (QUESTION.test(line) || /\?\s*$/.test(line)) {
      questions.push(sentence(line.replace(QUESTION, "").replace(new RegExp(`^${NAME}\\s*:\\s*`), "")));
      continue;
    }
    // Implicit actions: "@Priya …" or "Rohan will … by Friday".
    const owner = parseOwner(line);
    const due = parseDue(line, meetingDate);
    if ((owner && /@|\bwill\b|\bto\b/.test(line) && (due || /@/.test(line))) || (owner && /\b(?:will|to)\b/.test(line) && due)) {
      actions.push({ task: tidyTask(line), owner, due });
    }
  }

  const parts = [
    decisions.length && `${decisions.length} decision${decisions.length > 1 ? "s" : ""}`,
    actions.length && `${actions.length} action item${actions.length > 1 ? "s" : ""}`,
    questions.length && `${questions.length} open question${questions.length > 1 ? "s" : ""}`,
  ].filter(Boolean);
  return {
    summary: parts.length ? `${title}: ${parts.join(", ")}.` : `${title}: no decisions or action items were found in the notes.`,
    decisions,
    actions,
    questions,
  };
}

const sentence = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Drop the owner prefix and "@"; keep the deadline words (they're useful context). */
function tidyTask(s: string) {
  return sentence(
    s
      .replace(/@([\w.-]+)/g, "$1")
      .replace(new RegExp(`^${NAME}\\s*(?::|-|–)\\s*`), "")
      .replace(/\(owner[^)]*\)/i, ""),
  );
}
