# Contributing to CampusBuzz

Everyone on the team commits. Nobody pushes straight to `main`.

## Workflow

1. **Sync** — `git checkout main && git pull`
2. **Branch** — one branch per piece of work:
   `feat/phase-3-member-pass`, `fix/users-pagination`, `chore/seed-events`
3. **Commit small and often** using [Conventional Commits](https://www.conventionalcommits.org):
   - `feat(members): digital pass QR code`
   - `fix(rbac): block self-assignment of roles`
   - `chore(seed): add 60 ticket orders`
   - `docs: phase 3 tech stack`
4. **Check** — `npm run check` (types + lint + tests) and `npm run format` before pushing.
5. **Pull request** into `main` using the template. CI must pass and **one teammate reviews** before merge.
6. **Squash-merge**, delete the branch.

## Ownership (suggested split)

Rotate reviewers so everyone knows every module.

| Area                                  | Owner | Reviewer |
| ------------------------------------- | ----- | -------- |
| RBAC, auth, audit (`src/lib`)         |       |          |
| Admin pages (`src/app/(app)/admin`)   |       |          |
| Database schema & seed (`prisma/`)    |       |          |
| UI system & layout (`src/components`) |       |          |

## Rules of the codebase

- **Every mutation** is a `guardedAction` with a permission and a Zod schema, and writes an `audit()` row in the same transaction.
- **Validation schemas** live in `src/lib/validation` and are used by both the form and the action.
- **New permission?** Add it to `src/lib/rbac/catalog.ts`, then run `npm run db:seed` (or restart setup) to sync.
- **Schema change?** `npm run db:migrate -- --name <what-changed>` and commit the migration folder.
- **New demo data?** Add a module in `prisma/seed/` — keep it deterministic (use the shared `faker`).
- Don't commit `.env`. Use `.env.example` for new variables.
