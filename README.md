# Wombo Combo

Project management for installation and fitout contractors — from new request through to
financially closed. Built from `Project_Management_Platform_Workflow_Specification_5040.pdf`.

## Getting started

Double-click **`Start Web App.command`**. It installs dependencies if needed, starts the
server, opens your browser, and shuts everything down when you close the window.

Or from a terminal:

```bash
npm run dev
```

Open http://localhost:3000. No database or auth configuration is needed — with no
`DATABASE_URL` the app serves a demo dataset (a commercial fitout contractor with fourteen
jobs spread across every workflow stage).

Use the **Viewing as** dropdown in the top bar to switch roles and see how the app changes.
An installer gets a different navigation bar, no financials, and no status controls.

## Stack

| Layer | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16, App Router, React Server Components | Deploys to Vercel unchanged |
| Styling | Tailwind v4 with CSS-variable tokens | Light and dark, no config file needed |
| Database | Neon Postgres via Drizzle ORM | `neon-http` driver — serverless-friendly |
| Auth | WorkOS AuthKit | Behind an adapter; not yet connected |
| Validation | Zod | Same schema validates the form and the server action |

## Architecture

```
src/
  app/
    (app)/            authenticated shell — sidebar + mobile bottom nav
      projects/[id]/  project workspace: overview, quote, schedule, tasks,
                      field, documents, qa, costing, activity
    actions/          server actions — the only write path
  components/         UI primitives and feature components
  lib/
    auth/             session adapter (swap point for WorkOS)
    data/             repository layer + demo dataset
    db/schema/        Drizzle tables
    domain/           status machine, automations, quoting, costing, scheduling, RBAC
```

Three rules hold the structure together:

1. **Screens never touch the database.** Everything reads through `src/lib/data/repository.ts`,
   whose functions all take `orgId` first. Replacing the demo store with Drizzle queries
   changes those function bodies and nothing else.
2. **Business rules are pure functions** in `src/lib/domain/`, with no data access. They are
   trivially testable and safe to run on the client for optimistic UI.
3. **Access is by capability, not by role.** Screens and server actions check capabilities
   (`finance.view`, `project.transition`); `src/lib/domain/permissions.ts` maps roles onto
   them. Adding a role is one entry in that file. The live matrix renders at `/admin`.

### Status workflow

`src/lib/domain/status.ts` holds the state machine: thirteen pipeline statuses plus
`on_hold`, `lost` and `cancelled`. Transitions are an explicit table — anything not listed is
rejected. Entry requirements are declarative guards, either **blocking** (a quote cannot be
issued without internal approval) or **warning** (an override with a recorded reason).

The spec's two status lists disagree with each other. The *Project Status Flow* section is
treated as canonical; "Project Workspace" and "Field Execution" are surfaces available from
`scheduled` onwards rather than states, and collapse into `in_progress`. "Completion
Certificate" is an artefact generated when QA passes, not a state.

### Automations

`src/lib/domain/automation.ts` encodes the spec's trigger/action table as data. Rules resolve
to described *effects*; an executor decides whether to run them inline, enqueue them, or (in
demo mode) log them. Failures are collected rather than thrown — a notification that cannot
send must not roll back the status change a human just made. The rules render at `/admin`.

## Connecting the real services

### Neon

1. Create a project, copy the pooled connection string into `.env.local` as `DATABASE_URL`.
2. `npm run db:generate && npm run db:migrate`
3. Replace the function bodies in `src/lib/data/repository.ts` with Drizzle queries. Every
   `where` clause starts `eq(table.orgId, orgId)`.
4. Implement `persistTransition` and `executeEffect` in `src/app/actions/projects.ts`.

`neon-http` has no interactive transactions. The two places that need atomicity — project
number allocation and quote total recalculation — are marked with `TODO(neon)` comments.

### WorkOS

1. `npm i @workos-inc/authkit-nextjs`
2. Add `middleware.ts` exporting `authkitMiddleware`.
3. Replace the body of `loadSession()` in `src/lib/auth/session.ts` with `withAuth()`, mapping
   the WorkOS organization onto `organizations.workosOrgId`. No call sites change.
4. Delete `RoleSwitcher` and `src/app/actions/demo.ts`.

### Vercel

Deploys as-is. Set `DATABASE_URL` and the WorkOS variables as environment variables.

## Mobile

The field app is the reason this is mobile-first, not an afterthought. `/field` is one screen:
today's job, a full-width clock-on button with a live timer, and four quick actions. Tap
targets are 44px minimum, inputs are 16px so iOS does not zoom, the bottom nav respects the
home indicator, and the nav reorders by role so an installer's first tab is **My Day**.

## Not built yet

Deliberately out of scope for this pass, all with a place to slot into:

- Write paths beyond the status machine (quote editing, allocation, clock on/off persist)
- Quote PDF generation and customer-facing quote acceptance
- File upload — schema and UI exist, blob storage is not wired
- Xero and email/SMS notification integrations
- Photo capture and gallery
- Full-text search (the top bar input is a placeholder)
