# CampusBuzz

**The operating system for student organizations.** Members, events, tickets, merchandise, volunteers, fundraisers and
finance in one place, with role-based access, a full audit trail and (in later phases) an AI layer that explains its
reasoning.

> Built phase by phase. Phases 1–2 (Master Admin, organization setup, role & permission engine) are complete.

---

## Quick start (fully offline after first install)

Prerequisites: **Node 20.9+** (22 recommended), **Docker Desktop**.

```bash
npm install                 # also generates the Prisma client
cp .env.example .env        # then set AUTH_SECRET (command is in the file)
npm run db:up               # local PostgreSQL 17 on port 5433
npm run db:migrate          # create tables
npm run db:seed             # demo dataset (~430 people, roles, committees, audit history)
npm run dev                 # http://localhost:3000
```

No seed? Visit `http://localhost:3000` and the **setup wizard** creates your organization and its Master Admin.

### Demo logins

All seeded accounts share the password defined as `DEMO_PASSWORD` in [`prisma/seed/shared.ts`](prisma/seed/shared.ts).

| Persona       | Email                    | What to look at                                              |
| ------------- | ------------------------ | ------------------------------------------------------------ |
| Master Admin  | `admin@horizon.test`     | Everything; can grant Master Admin                           |
| President     | `president@horizon.test` | Broad view, no CCTV, has a GRANT override for expense backup |
| Treasurer     | `treasurer@horizon.test` | Finance-only — admin pages return "no access"                |
| Secretary     | `secretary@horizon.test` | Can create users but **not** assign roles                    |
| Event Head    | `events@horizon.test`    | Has a DENY override on refunds                               |
| Security Head | `security@horizon.test`  | Only preset with CCTV permissions                            |

Other personas: `vp@`, `volunteers@`, `merch@`, `comms@`, `deputy.events@`, `fundraising@` (all `@horizon.test`).

---

## Scripts

| Command              | What it does                                         |
| -------------------- | ---------------------------------------------------- |
| `npm run dev`        | Start the app with hot reload                        |
| `npm run check`      | Type-check + lint + unit tests (run before every PR) |
| `npm run test`       | Unit tests (Vitest)                                  |
| `npm run format`     | Format with Prettier                                 |
| `npm run db:up`      | Start local Postgres (Docker)                        |
| `npm run db:migrate` | Apply / create migrations                            |
| `npm run db:seed`    | Wipe and rebuild the demo dataset (deterministic)    |
| `npm run db:studio`  | Browse the database in Prisma Studio                 |

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
src/
  app/
    (auth)/            login, first-run setup, auth actions
    (app)/             signed-in area (shell + pages)
      dashboard/
      admin/           users · roles · departments · committees · audit · organization
      profile/         my profile, password, "what can I do and why"
    api/               REST endpoints (user search, CSV exports)
  lib/
    rbac/              catalog · presets · resolve · guards · sync
    auth/              session · password · current-user · rate-limit
    validation/        Zod schemas shared by client and server
    action.ts          guardedAction(): auth → permission → validation → handler
    audit.ts           transactional audit writer + diff helper
prisma/
  schema.prisma        data model
  seed/                deterministic demo dataset, one module per phase
tests/                 Vitest unit tests
```

Every mutation goes through `guardedAction` and writes its audit row inside the same database transaction.

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
| Offline / local-first        | No cloud dependency at runtime                                                              |
