# EnviroShield Insulation Project Portal — working notes

Project management platform for installation/fitout contractors. Source of truth for
requirements is `Project_Management_Platform_Workflow_Specification_5040.pdf`.

## Commands

```bash
npm run dev         # http://localhost:3000, runs on demo data with no config
npm run build       # includes typecheck
npm run lint
npm run db:generate # after any change under src/lib/db/schema/
npm run db:status   # read-only: is a database behind the code?
npm run db:deploy   # apply pending migrations (this runs itself on deploy)
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

Writes live in the actions and each one dispatches on `hasDatabase` itself; all of them
are ported. **Keep it that way** — reads come from Postgres as soon as `DATABASE_URL` is
set, so an action that writes only to the JSON store saves without error and the screen
never shows the change. There is no error to notice. `actions/demo.ts` is the one
deliberate exception: it reads the store for the demo user switcher and writes nothing.

Money is never summed in SQL — totals come from `src/lib/domain/*` so a list page and a
detail page cannot disagree. `neon-http` has no interactive transactions, so anything
needing atomicity is a single statement: project numbers use `INSERT ... ON CONFLICT DO
UPDATE ... RETURNING`, quote versions compute `max(version) + 1` inline, and status
transitions guard on `where status = <expected>` and report a conflict when the guard misses.

Migrations are applied by the deploy, not by hand: `vercel.json` sets the build command
to `npm run db:deploy && next build`, so a build that cannot migrate fails and the previous
deploy stays live rather than shipping code that names a column production lacks. Preview
deployments skip the migration, because preview inherits production's `DATABASE_URL` and
would otherwise apply an unmerged branch's migrations to production; set
`ALLOW_PREVIEW_MIGRATIONS="true"` on a preview that has a database branch of its own.

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
DRAFT, approved and sent by a human there. There is no quote PDF: a quote's only
customer-facing form is the draft Xero produces.

**Xero is the source of truth for customers**, and unlike materials that sync is two-way —
see `src/lib/integrations/xero/contacts.ts`. `syncContactsFromXero` pulls **active,
non-supplier contacts only**, matching on `xero_contact_id` then on name, adding and
updating; it never writes `active`, so archiving stays a human decision on one side or the
other. A customer with no Xero contact is left alone, because it may have live projects and
gets linked by `ensureXeroContact` on its first export. Note `isCustomerContact` tests for
*not a supplier* rather than `IsCustomer`: Xero only sets `IsCustomer` once a contact has
been invoiced, so the obvious test would stop a newly created customer from ever syncing.
Creating, editing or archiving a customer here pushes the same change up.

Deep links into Xero's UI are built in `xero/links.ts` and addressed by the organisation's
`ShortCode`, not its tenant id — without it, a bookkeeper signed into more than one Xero
org lands in whichever one Xero last had open. The short code is fetched lazily on first
use and cached on `xero_connections.short_code`. A missing one costs a hyperlink and
nothing else; callers render plain text.

Nothing re-reads a quote *from* Xero. `xero_quote_status` is written at export and by
`markQuoteInvoiced`, so edits made in Xero are invisible here, and `exportProjectInvoice`
bills the app's own lines. The `invoice_exports` idempotency guard is keyed on the
**project**, so it cannot see an invoice raised inside Xero.

Clean-up is separate and two-step: `findStaleXeroCustomers` reads and classifies, the
person confirms, then `archiveStaleXeroCustomers` archives. It **archives locally and
pushes nothing** — the contacts it finds are suppliers or already archived in Xero, so
mirroring the archive back would retire a live supplier record over a tidy-up of this
app's list. Do not "fix" that by reusing `setXeroContactArchived` here.
Keep every write path pushing: reads come back from Xero on the next sync, so a change that
only lands locally is silently reverted and looks like the save not working. That is also
why `contactPayload` sends empty strings rather than omitting keys — Xero reads an absent
field as "leave it alone", which would make clearing an email impossible.

**`syncItemsFromXero` is the only thing that writes a material.** There is no create,
edit or CSV-import path, and adding one would be a bug: `materialValues` blanks
`xero_item_id` for any input that does not carry one, so a write from this side detaches
the row from its Xero item and silently stops its lines carrying a code until the next
sync. Deleting is the exception — the sync only adds and updates, so removing a row is
the only way to clear an item that no longer exists in Xero.

## Mobile

Non-negotiable, because field crews are half the users: 44px minimum tap targets, 16px inputs
(iOS zooms below that), `pb-safe` on anything fixed to the bottom, and wide content scrolls
inside its own container rather than the page. Test at 375px before calling a screen done.
