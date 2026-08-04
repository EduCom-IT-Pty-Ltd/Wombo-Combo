# EnviroShield Insulation Project Portal — working notes

Project management platform for installation/fitout contractors. Source of truth for
requirements is `Project_Management_Platform_Workflow_Specification_5040.pdf`.

## Commands

```bash
npm run dev         # http://localhost:3000, runs on demo data with no config
npm run build       # includes typecheck
npm run lint
npm run db:generate # after any change under src/lib/db/schema/
```

## Conventions that matter

- **Money is integer cents.** Never floats. Format with `formatMoney` from
  `src/lib/domain/money.ts`. Margin is on *sell*, not markup on cost.
- **Every tenant-owned table has `orgId`**, and every repository function takes it as the
  first argument. Do not add a query without it.
- **Reads go through `src/lib/data/repository.ts`.** Components never import from
  `src/lib/db` directly.
- **Writes go through server actions in `src/app/actions/`.** Each one starts with
  `requireCapability(...)`, which returns the session so the tenant id comes from the same
  call.
- **Permission checks use capabilities**, never `role === "admin"`. See
  `src/lib/domain/permissions.ts`.
- **Status changes only via `transitionProject`.** It validates the edge, evaluates guards,
  writes the audit event, then fires automations. Do not set `projects.status` anywhere else.
- `src/lib/domain/*` stays pure — no imports from `db`, `data`, or `next/*`.

## Data layer

Reads go through `src/lib/data/repository.ts`, which dispatches to
`src/lib/data/pg/*` when `hasDatabase` is true and to the JSON store otherwise. Every
repository read is ported.

**Writes are not all ported, and a write that is not is silently lost.** Reads come
from Postgres as soon as `DATABASE_URL` is set, so an action that still writes only to
the JSON store saves without error and the screen never shows the change. Each action
dispatches on `hasDatabase` itself. Still JSON-only, and broken against a database:
`attendance.ts`, `labour.ts`, `project-templates.ts`, `qa-schedule.ts`,
`schedule-phases.ts`. Check before trusting a save.

Money is never summed in SQL — totals come from `src/lib/domain/*` so a list page and a
detail page cannot disagree. `neon-http` has no interactive transactions, so anything
needing atomicity is a single statement: project numbers use `INSERT ... ON CONFLICT DO
UPDATE ... RETURNING`, quote versions compute `max(version) + 1` inline, and status
transitions guard on `where status = <expected>` and report a conflict when the guard misses.

## Demo mode

With no `DATABASE_URL`, `isDemoMode` is true and reads come from the JSON store seeded by
`src/lib/data/demo-data.ts`. The role and user switchers in the top bar are active. Set
`DEMO_MODE="true"` to force it on even with a database configured.

## Auth

WorkOS AuthKit, email + password, invite-only. Authentication is not authorisation: WorkOS
proves identity, and a `memberships` row decides access. A user who authenticates without
one is sent to `/no-access`. `WORKOS_BOOTSTRAP_EMAIL` is the recovery hatch and bypasses
both the organisation and membership checks. Onboarding is: invite in WorkOS ->
`npm run sync:org` -> they can sign in.

## Integrations

SharePoint via Microsoft Graph, app-only client credentials with `Sites.Selected` on one
site. Folder identity is `driveItemId`, never a path — a rename in SharePoint changes the
path but not the id. `npm run graph:check` exercises the whole chain.

Xero via OAuth 2.0 Web App flow, granular scopes (`accounting.invoices` covers Quotes,
Invoices *and* Items). The material catalogue is mirrored **from** Xero's items — one way,
never written back — so quote and invoice lines can carry an `ItemCode` Xero already knows
and land in that item's own revenue account. Only rows with a `xero_item_id` may send a
code; an unrecognised one fails the whole document. Everything we create in Xero is a
DRAFT, approved and sent by a human there.

## Mobile

Non-negotiable, because field crews are half the users: 44px minimum tap targets, 16px inputs
(iOS zooms below that), `pb-safe` on anything fixed to the bottom, and wide content scrolls
inside its own container rather than the page. Test at 375px before calling a screen done.
