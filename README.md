# CampusBuzz

**An intelligent operating system for student organizations.** One place for members, events, tickets, merchandise,
volunteers, fundraisers and finance — replacing spreadsheets, cash notebooks and chat threads — with a layer that
explains what's happening and helps plan what's next. Every AI feature proposes; a person decides.

| Layer          | What it covers                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Operate**    | Members & digital pass · Events, tickets & check-in · Merch · Volunteers · Fundraisers · Finance · Security cameras |
| **Understand** | Insights & organization pulse · Ask (data copilot) · Analytics · Reports & summaries                                |
| **Anticipate** | What-if simulator · Calendar & smart reminders · Meeting intelligence · Organization memory                         |

> All 25 phases are built: foundation and access control (1–2), the core modules (3–8), analytics, insights, copilot,
> summaries and reports (9–13), calendar, CCTV, memory, simulation, pulse, meetings and handover (14–20), audit,
> role dashboards, UI and AI principles (21–24), and the product architecture below (25).

---

## Quick start (fully offline after first install)

Prerequisites: **Node 20.9+** (22 recommended), **Docker Desktop**.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set AUTH_SECRET (command is in the file)
npm run db:up               # local PostgreSQL 17 on port 5433
npm run db:migrate          # create tables
npm run db:seed             # small demo dataset (~50–60 rows per category, ~10 s)
# npm run db:seed:full      # large dataset for the final demo (~430 people, 8,000+ tickets)
npm run dev                 # http://localhost:3000
```

No seed? Visit `http://localhost:3000` and the **setup wizard** creates your organization and its Master Admin.

### Demo logins

All seeded accounts share the password defined as `DEMO_PASSWORD` in [`prisma/seed/shared.ts`](prisma/seed/shared.ts).

| Persona       | Email                         | What to look at                                                               |
| ------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| Master Admin  | `admin@horizon.test`          | Everything; can grant Master Admin                                            |
| President     | `president@horizon.test`      | Pulse + insights on the dashboard, What if?, reports, announcements, no CCTV  |
| Treasurer     | `treasurer@horizon.test`      | Finance: approvals, pay-backs, budgets; admin pages return "no access"        |
| Secretary     | `secretary@horizon.test`      | Can create users but **not** assign roles                                     |
| Event Head    | `events@horizon.test`         | Organizes the Diwali Gala; sees only that event's cameras; DENY on refunds    |
| Security Head | `security@horizon.test`       | Every camera, live + playback; each view is logged                            |
| Member        | `bhamini.sharma@horizon.test` | The simple member view: pass, events, tickets, merch, announcements, calendar |

Other personas: `vp@`, `volunteers@`, `merch@`, `comms@`, `deputy.events@`, `fundraising@` (all `@horizon.test`).

Stories baked into the data (numbers for the full dataset): **42 members expire within 7 days**, 14 sign-ups are waiting for payment
confirmation (most with a UPI reference to check), and 48 lapsed members never renewed. Every seeded member's
standing is visible on **/members**; regular members see their own pass at **/me/pass**. **Diwali Gala Night 2026** (in
~5 weeks) has ticket sales that started strong and then slowed, and the **Freshers' Welcome Mixer** is live today, so the
command center shows real arrivals. The **Winter Clothes Drive** fundraiser is behind its goal with two overdue tasks.
On **/finance** the treasurer has a queue of expense claims to review (Freshers snacks among them) and four people
waiting to be paid back. **Insights** flag the Gala slowdown and the expiring memberships (with a one-click renewal
reminder draft), last year's Gala debrief and lessons are in **Memory**, this year's Gala planning notes are waiting in
**Meetings** to be turned into tasks, and an AI-written renewal reminder waits in **Announcements** for a person to send.

---

## Scripts

| Command                | What it does                                            |
| ---------------------- | ------------------------------------------------------- |
| `npm run dev`          | Start the app with hot reload                           |
| `npm run check`        | Type-check + lint + unit tests (run before every PR)    |
| `npm run test`         | Unit tests (Vitest)                                     |
| `npm run format`       | Format with Prettier                                    |
| `npm run db:up`        | Start local Postgres (Docker)                           |
| `npm run db:migrate`   | Apply / create migrations                               |
| `npm run db:seed`      | Wipe and rebuild the small demo dataset (deterministic) |
| `npm run db:seed:full` | Same, with the large demo dataset                       |
| `npm run db:studio`    | Browse the database in Prisma Studio                    |

---

## Tech stack by phase

Each phase lists only what it **adds**. Nothing is added unless it earns its place.

### Phase 1–2 · Foundation, Master Admin, Role & Permission engine

| Layer      | Choice                                                  | Why                                                                             |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Framework  | **Next.js 16** (App Router, Turbopack) + **TypeScript** | One codebase for UI + backend; server components keep data access on the server |
| UI         | **Tailwind CSS v4** + **shadcn/ui** (Radix)             | Accessible primitives, one design-token system, light/dark themes               |
| Database   | **PostgreSQL 17** (Docker, local)                       | Relational data (people ↔ roles ↔ committees); runs offline                     |
| ORM        | **Prisma 7** + `@prisma/adapter-pg`                     | Typed queries, versioned migrations                                             |
| Validation | **Zod 4** + **react-hook-form**                         | One schema validates in the browser _and_ on the server                         |
| Auth       | Signed **JWT session cookie** (`jose`) + **bcrypt**     | Local, no third-party auth service; sessions revocable via `sessionVersion`     |
| Testing    | **Vitest**                                              | Fast unit tests for RBAC rules and validation                                   |
| Demo data  | **Faker** (`en_IN`, fixed seed)                         | Realistic, reproducible, privacy-safe dataset                                   |
| Tooling    | ESLint, Prettier, GitHub Actions CI                     | Same checks locally and on every pull request                                   |

### Phase 3 · Member management & digital pass

| Adds                                     | Why                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------------------- |
| **`qrcode`**                             | Server-rendered SVG QR codes for passes and UPI payment links — no external QR service |
| **`jsqr`**                               | Decodes the door scanner's camera frames in the browser, so pass checks work offline   |
| **UPI deep links** (`upi://`)            | Members pay the exact dues from any UPI app; no payment gateway or fees needed         |
| **Next.js `instrumentation`**            | Runs local background jobs (renewal reminders every 6 h) without a cloud scheduler     |
| **Short polling** (`/api/notifications`) | Notification bell stays current (30 s + on focus) with zero extra infrastructure       |

### Phase 4 · Events, tickets & command center

| Adds                                            | Why                                                                                               |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Server-Sent Events** (`/api/events/:id/live`) | Live command center and door counters, pushed every 3 s — no WebSocket server needed              |
| **Atomic SQL counters**                         | `UPDATE … WHERE allocated + n <= quantity` reserves seats, so the last ticket can't be sold twice |
| Shared **jsQR** scanner                         | Same offline camera scanner for passes and tickets; continuous mode for busy doors                |

### Phase 5 · Merchandise & AI Merch Studio

| Adds                                                            | Why                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **`@anthropic-ai/sdk`** (`claude-opus-5-5`, structured outputs) | "Generate with AI" designs print-ready SVG artwork; responses are schema-validated          |
| **Offline template designer**                                   | Five SVG print styles generated locally — the studio works with no internet or API key      |
| **Vector mockups + CSS 3D**                                     | Hoodie / tee / cap / tote / mug previews you can rotate — no image assets, no WebGL         |
| **Local file storage** (`storage/uploads`)                      | Logo uploads (and receipts in Phase 8) with content sniffing and permission-checked serving |

### Phase 6 · Fundraisers & volunteers

| Adds                     | Why                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **Explainable matching** | Pure scoring function (skills, free time, interests, experience, workload) with a reason for each pick |
| **Overload guard**       | A volunteer already at their weekly hours drops below anyone with spare time — matching never piles on |

### Phases 7–8 · Finance & AI Receipt Scanner

| Adds                                   | Why                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **One ledger, two sources**            | Money in = receipted payments (dues, tickets, merch, donations); money out = approved expenses              |
| **Four-eyes approval**                 | Nobody approves their own claim; a still-pending check in the UPDATE stops two treasurers both deciding     |
| **Claude vision** (structured outputs) | Reads a receipt photo or PDF into shop, date, total, GST and category — it fills the form, a person submits |
| **Offline receipt reader**             | No key or no internet? Paste the receipt text (phone cameras can copy it) and a local parser fills the form |

### Phase 9 · Analytics engine

| Adds                                                | Why                                                                                                            |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Pure analytics maths** (`lib/analytics/rules.ts`) | Month series, period-over-period change, least-squares trend (only reported when R² ≥ 0.5) — all unit-tested   |
| **Like-for-like comparisons**                       | The previous period is cut at the same point as today, so a half-finished month isn't compared with a full one |
| **Server-rendered SVG charts**                      | No chart library or client JS — instant, offline, themed, with hover values                                    |
| **Monthly budgets**                                 | One limit per spending category; the Finance tab shows how much of each is used this month                     |

### Phases 10, 11, 18 · Insights, copilot & organization pulse

| Adds                          | Why                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Rule-based insight engine** | Each insight states its threshold ("why"), shows the evidence rows and suggests a next step — no mystery score |
| **Explainable pulse**         | One colour per area derived only from those insights; click to see why it's orange and what was checked        |
| **Grounded copilot**          | Claude only picks _which_ question you asked; every number is computed from the database and cited             |

### Phases 12, 13, 20 · Summaries, reports & handover

| Adds                        | Why                                                                                                 |
| --------------------------- | --------------------------------------------------------------------------------------------------- |
| **Fact-first builders**     | Event, finance, membership, fundraiser, merch, volunteer reports, period summaries and the handover |
| **Number-locked AI polish** | Claude may rewrite wording; any section whose numbers change is rejected automatically              |
| **Edit → final → export**   | Every section editable; print-to-PDF page and Markdown download, both audited                       |

### Phases 14, 16, 19 · Calendar, memory & meetings

| Adds                      | Why                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| **One calendar**          | Events, sales closing, meetings, deadlines, expiries, fundraiser dates, your tasks — permission-filtered |
| **Smart reminders**       | Event in 2 days, task overdue, sales closing, deadline tomorrow, meeting tomorrow — deduplicated         |
| **Meeting intelligence**  | Notes/transcript → decisions, actions (owner + date), questions; tasks only after "Confirm"              |
| **Offline memory search** | Year-aware ranking over lessons, decisions, vendors, sponsors, reports, meetings and past events         |

### Phases 15, 17, 21 · CCTV, what-if & audit

| Adds                     | Why                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| **Scoped CCTV module**   | Security Head: all cameras; Event Head: own events' cameras (live only); everyone else: nothing                |
| **Logged viewing**       | Privacy notice + purpose confirmation; every live/playback view logged with IP and device; no face recognition |
| **Read-only simulator**  | A copy of live data + transparent formulas; the page has no server actions, so it can't change anything        |
| **Readable audit trail** | Who, what, when, before → after, IP and device for every action                                                |

### Phases 22–25 · Dashboards, UI, AI principles & architecture

| Adds                              | Why                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Role-aware dashboard**          | Permission-scoped to-dos plus the three panels that matter for the role (pulse, your events, coming up…) |
| **Human-confirmed announcements** | AI drafts; a publisher confirms the exact recipient count; audiences: members, expiring, volunteers, all |
| **"How AI works here" page**      | Every AI feature: what AI does, what a person does, the guardrail, and the offline fallback              |
| **Three-layer navigation**        | Operate / Understand / Anticipate — the product architecture is the sidebar                              |

### Keeping it simple

Busy pages are split into link-based tabs (`?tab=…`, so refresh, back and shared links still work), and the dashboard
is a short "Needs your attention" list that only shows items you can act on.

Set `ANTHROPIC_API_KEY` in `.env` to enable AI features; without it they fall back to their offline mode automatically.

---

## What's in Phase 1–2

**Phase 1 — Master Admin & organization**

- First-run **setup wizard** creates the organization and its Master Admin, then locks itself.
- Organization settings, departments (with heads) and committees (term, chair, members, history).
- User accounts: create (with one-time temporary password), edit, suspend/reactivate, reset password, CSV export.
- Master Admin is a protected **account flag**, not a role: only a Master Admin can grant it, and the last one can't be
  removed or suspended.

**Phase 2 — Role & permission engine**

- **67 permissions across 21 modules** declared in code ([`src/lib/rbac/catalog.ts`](src/lib/rbac/catalog.ts)) and
  synced to the database so assignments are FK-enforced. Future modules (CCTV, finance, AI…) are declared up front.
- **12 built-in roles** (President … General Member, plus Security Head) and **custom roles** (create, copy, edit, delete).
- **Per-person overrides**: GRANT or DENY a single permission with a reason. DENY always wins over roles.
- Effective permissions = ∪ role permissions + GRANTs − DENYs. The user page shows _where each permission comes from_.
- **Anti-escalation rules**: you can only grant or revoke permissions you hold; non-masters can't change their own access
  or touch a Master Admin.
- Navigation, pages, server actions and APIs are all permission-checked server-side; the sidebar hides what you can't use.

**Phase 3 — Membership**

- **Plans & benefits** (Semester / Annual / Two-Year / Alumni) with prices in paise and benefits per plan.
- **Registration three ways**: desk registration by staff (cash/UPI/card/bank, receipt issued instantly), public
  self sign-up at `/join` (honeypot + rate limit, can be switched off), or renewal from **My membership**.
- **Status that can't go stale**: only _pending / active / cancelled_ are stored — _expiring_ (≤ 30 days) and _expired_
  are derived from dates at read time and filtered in SQL.
- **Renewals stack**: a renewal starts the day after the current term ends, so paying early never loses days. Every term
  is kept as history.
- **Payments**: receipt numbers (`RCP-2026-00042`), method + transaction reference, who received it. A member can submit
  their UPI reference; the treasurer checks it and confirms.
- **Digital member pass**: member number, status, validity, eligible benefits, committees and contribution history, a
  QR code, and a live ticking clock so a screenshot is easy to spot. Members can rotate their QR if it leaks.
- **Door verification**: camera scanner + manual lookup. A scanned QR opens a big green/red result — only for people with
  `members.verify`, so a stranger scanning a pass learns nothing. Every check is logged.
- **Renewal reminders**: in-app notifications at 30 / 7 / 1 days before expiry and after lapsing, idempotent via
  dedupe keys. Staff can also trigger them manually.
- New permission **`members.manage_plans`** (Treasurer, Secretary). Recording dues needs `members.edit` or
  `finance.record_income`.

**Phase 4 — Events & tickets**

- Events with venue, schedule, capacity, sales window, organizer and committee; draft → publish → (cancel) lifecycle.
- Ticket types with **member and non-member prices**, inventory, per-order limits and members-only types. An active
  member gets member pricing on **one ticket per event** (their own); extra tickets are charged the public price.
- **Online sales** (seats held 48 h; pay by UPI QR or at the desk; free events confirm instantly) and **door sales**.
- **QR tickets** in _My tickets_; door **check-in** with a continuous scanner — each ticket admits once, and a second
  scan shows "already checked in at 19:42 via …".
- Attendance, no-shows, revenue and refunds per event; cancelling an event voids unpaid orders and notifies holders.
- **Event Command Center**: tickets sold, people inside, revenue, arrivals per 10 minutes, latest check-ins and
  timestamped incidents — streamed live.

**Phase 5 — Merchandise & Merch Studio**

- Products with size × colour **variants**, member pricing (15% off), unit cost and margin, draft/on-sale/archived.
- **Inventory**: atomic stock changes (the last M hoodie can't be sold twice), reorder levels, low-stock flags,
  30-day sales per size, stock value at cost, and a **stock movement log** for every change ("30 → 29, sale MRC-…").
- **Orders**: online (items held 48 h, UPI QR) and desk sales; confirm payment → collect → done; cancel/refund puts
  stock back.
- **Merch Studio**: upload a logo, **generate artwork with AI** (or the offline templates), pick colours and sizes,
  preview front/back in a rotatable **3D-style mockup**, see cost/margin/member price, send for review. A **different
  person** must approve (four-eyes rule), then one click creates a draft product. Previews are labelled as previews.

**Cross-cutting**

- **Audit log**: every change records actor, action, before/after diff, IP and user agent, committed in the same
  transaction as the change. Filterable, exportable, and exports are themselves audited.
- **Security**: login rate-limiting, constant-time-ish unknown-email handling, open-redirect-safe `next=` param,
  CSV formula-injection protection, sessions revoked instantly on suspend/password change.
- **Responsive**: sidebar on desktop, drawer on mobile, tables collapse into stacked rows on phones. `Ctrl K` jumps to any
  page you can access.

---

## Architecture

```
                         MASTER ADMIN
                              │
                 ACCESS CONTROL (RBAC + audit trail)
                              │
   ┌──────────── OPERATE ──────────────────────────────────────┐
   │ Members · Events · Tickets · Merch · Volunteers           │
   │ Fundraisers · Finance · Security cameras                  │
   └──────────────────────────┬────────────────────────────────┘
                              │  organization data (Postgres)
   ┌──────────── UNDERSTAND ──┴────────────────────────────────┐
   │ Analytics · Insights + Pulse · Ask (copilot) · Reports    │
   └──────────────────────────┬────────────────────────────────┘
   ┌──────────── ANTICIPATE ──┴────────────────────────────────┐
   │ What-if · Calendar + reminders · Meetings · Memory        │
   └──────────────────────────┬────────────────────────────────┘
                              ▼
          AI PROPOSES → HUMAN REVIEWS → CONFIRMS → ACTION
```

```
src/
  app/(app)/           one folder per module (dashboard, members, events, merch, finance, insights,
                       copilot, analytics, reports, calendar, meetings, memory, simulate, security, …)
  app/api/             REST endpoints (exports, uploads, live event stream, report download)
  lib/
    rbac/              permission catalog · role presets · resolve · guards · sync
    action.ts          guardedAction(): auth → permission → Zod validation → handler
    audit.ts           transactional audit writer (who, what, before/after, IP, device)
    ai/claude.ts       the single door to Claude — every caller has an offline fallback
    analytics/ insights/ copilot/ reports/ calendar/ meetings/ memory/ simulate/ cctv/
                       pure rules (unit-tested) + server loaders per feature
prisma/
  schema.prisma        data model · migrations/ one per phase · seed/ one module per phase
tests/                 Vitest unit tests for every rule set
```

Every mutation goes through `guardedAction` and writes its audit row inside the same database transaction. AI
output is always validated against a schema, never executes a sensitive action, and has an offline fallback.

---

## Hackathon criteria — how they're met

| Criterion                    | How                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Dynamic data, no static JSON | Everything lives in Postgres; the seed writes through Prisma like the app does              |
| Responsive, consistent UI    | One token set (`globals.css`), shared components, mobile drawer + stacked tables, dark mode |
| Robust input validation      | Zod on client _and_ server, DB constraints, friendly unique-violation messages              |
| Intuitive navigation         | Permission-aware grouped sidebar, breadcrumbs, `Ctrl K` palette                             |
| Git used by the whole team   | See [CONTRIBUTING.md](CONTRIBUTING.md): feature branches, PR template, CI on every PR       |
| Backend APIs + local DB      | Server actions + REST routes, Prisma migrations, Postgres in Docker                         |
| Offline / local-first        | No cloud dependency at runtime; every AI feature has an offline mode                        |
| Trendy tech only with value  | AI proposes and explains, people confirm; SVG charts and SSE instead of heavy libraries     |
