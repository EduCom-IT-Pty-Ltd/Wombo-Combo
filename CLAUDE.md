# Wombo Combo — working notes

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

## Demo mode

With no `DATABASE_URL`, `isDemoMode` is true and reads come from `src/lib/data/demo-data.ts`.
Writes log to the console instead of persisting, and the role switcher in the top bar is
active. Places that need real implementations are marked `TODO(neon)`.

## Mobile

Non-negotiable, because field crews are half the users: 44px minimum tap targets, 16px inputs
(iOS zooms below that), `pb-safe` on anything fixed to the bottom, and wide content scrolls
inside its own container rather than the page. Test at 375px before calling a screen done.
