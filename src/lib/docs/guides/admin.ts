import type { DocGuide } from "../types";

export const ADMIN_GUIDES: DocGuide[] = [
  {
    slug: "materials-and-production",
    title: "Materials and production templates",
    summary: "The catalogue that comes from Xero, customer price lists, and the templates estimators quote from.",
    audience: ["Manager", "Estimator", "Administrator"],
    appHref: "/materials",
    appLabel: "Materials",
    sections: [
      {
        id: "catalogue",
        heading: "The material catalogue",
        blocks: [
          {
            kind: "text",
            body: "The catalogue is a mirror of your Xero items. Press **Sync from Xero** on the Materials screen and everything in Xero comes down with its code, name and price.",
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Materials are created and edited in Xero, not here",
            body: "There is no add-material form, and that is deliberate. A material written from this side loses its link to the Xero item, and its quote lines silently stop carrying an item code — which means they stop landing in that item's own revenue account. Add and edit materials in Xero, then sync.",
          },
          {
            kind: "text",
            body: "Deleting is the one exception. The sync only adds and updates, so removing a row here is the only way to clear an item that no longer exists in Xero.",
          },
          {
            kind: "text",
            body: "**Export CSV** gives you the catalogue as a spreadsheet, for pricing reviews and for checking against Xero.",
          },
        ],
      },
      {
        id: "variations",
        heading: "Variations",
        blocks: [
          {
            kind: "text",
            body: "A material can have variations — the same product in different thicknesses, colours or finishes, each with its own code and price. Variations are what lets a production template say *this job needs a wall batt* and leave the exact one to be chosen at quote time.",
          },
        ],
      },
      {
        id: "price-lists",
        heading: "Customer price lists",
        blocks: [
          {
            kind: "steps",
            items: [
              "On the Materials screen, name a new list under **Customer price lists** and create it.",
              "Add the materials that customer gets a different rate on, with their price per m².",
              "Assign the list to the customer from their customer page.",
            ],
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Only list the exceptions",
            body: "A material with no entry falls back to the standard price. A price list with four rows is a perfectly good price list — you do not have to restate the whole catalogue.",
          },
        ],
      },
      {
        id: "production-templates",
        heading: "Production templates",
        blocks: [
          {
            kind: "text",
            body: "A production template is a reusable model of the materials a type of job needs. It is what turns quoting from *type out twenty lines* into *pick a template and enter the square metres*.",
          },
          {
            kind: "steps",
            items: [
              "Go to **Production templates** and name a new one — describe the job type, not a customer.",
              "Add the materials it always needs.",
              "For any material where the exact product varies job to job, allow a variation choice. The estimator is then asked to pick at quote time.",
              "Save. It is immediately available to every estimator.",
            ],
          },
          {
            kind: "text",
            body: "Templates stack on a quote, so build them narrow and combine them rather than making one enormous template per job type.",
          },
        ],
      },
    ],
  },
  {
    slug: "people-and-labour",
    title: "People, leave and labour rates",
    summary: "Adding the team, hourly cost rates, availability, and the labour budget costing compares against.",
    audience: ["Owner", "Administrator", "Manager"],
    appHref: "/hr",
    appLabel: "People",
    sections: [
      {
        id: "adding",
        heading: "Adding someone",
        blocks: [
          {
            kind: "steps",
            items: [
              "Go to **People** and add a team member.",
              "Enter their full name and work email address.",
              "Pick their role — this decides what they can see. See [Roles and what each can do](/docs/roles-and-access).",
              "Set their **cost rate per hour**. This is what their time on site costs the business.",
              "Give them a calendar colour, so they are recognisable on the schedule at a glance.",
              "Send the invite. They get an email to set a password.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "The invite is what gives them access",
            body: "Adding a person to People creates the record. Until the invite is sent and accepted they cannot sign in. **Resend invite** is there for the one that got lost in a spam folder.",
          },
        ],
      },
      {
        id: "rates",
        heading: "Cost rates",
        blocks: [
          {
            kind: "text",
            body: "A person's hourly cost rate is copied onto each time entry when they check in. Changing a rate affects future shifts only — finished jobs keep the rate that applied when the work was done, so last quarter's margins do not move when you give somebody a pay rise.",
          },
        ],
      },
      {
        id: "leave",
        heading: "Leave and unavailability",
        blocks: [
          {
            kind: "text",
            body: "Record leave under **Leave & unavailability** with a person, a type, a start and end date and a status. Approved leave shows on the Calendar and in the Call-Up form, so schedulers see it while they are booking rather than afterwards.",
          },
          {
            kind: "text",
            body: "**Schedulable** on a person's profile controls whether they can be assigned Call-Ups at all — the switch to use for office staff who never go to site.",
          },
        ],
      },
      {
        id: "labour-settings",
        heading: "The Labour module",
        blocks: [
          {
            kind: "text",
            body: "**Labour** is Owner and Administrator only, and it holds the two company-wide numbers costing is built on.",
          },
          {
            kind: "definitions",
            items: [
              {
                term: "Standard labour budget",
                body: "A cost per employee, per job. Multiplied by the employee count set on each project, this becomes the labour budget the actual logged time is measured against.",
              },
              {
                term: "Subcontractor material rates",
                body: "A rate per m² per material, used when a job is subcontracted. Quoted m² × this rate gives the subcontractor material cost, which is only deducted on projects where it has been switched on.",
              },
            ],
          },
          {
            kind: "callout",
            tone: "warning",
            title: "These change every project at once",
            body: "Both figures feed the costing on every job, which is why they sit with the Owner and Administrator and cannot be delegated. Per-project choices — the employee count, whether subcontractor cost applies — stay on the project's Costing tab.",
          },
        ],
      },
    ],
  },
  {
    slug: "settings",
    title: "Settings",
    summary: "Organisation details, renaming the workflow, access, and what the portal does on its own.",
    audience: ["Owner", "Administrator"],
    appHref: "/admin",
    appLabel: "Settings",
    sections: [
      {
        id: "organisation",
        heading: "Organisation",
        blocks: [
          {
            kind: "text",
            body: "Company name, project ID prefix, currency, timezone and the logo shown across the app and in the sidebar.",
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Set the project ID prefix before you start",
            body: "It is built into every project number as it is allocated. Changing it later does not renumber the jobs already created, so you end up with two conventions in one list.",
          },
        ],
      },
      {
        id: "workflow",
        heading: "Project workflow",
        blocks: [
          {
            kind: "text",
            body: "This is where the stages get your company's language rather than ours, and where you decide what each stage asks for.",
          },
          {
            kind: "definitions",
            items: [
              { term: "Status name", body: "What the stage is called everywhere in the app." },
              { term: "Stage colour", body: "The colour it carries on the board, the badges and the dashboard." },
              { term: "Checklist tasks", body: "The list of things to tick off at that stage, on every project." },
              {
                term: "Custom project fields",
                body: "Details captured at that stage — a PO number, a permit reference. Mark one **mandatory** and the project cannot progress until it is filled in.",
              },
            ],
          },
          {
            kind: "text",
            body: "Stages can be reordered, and the fixed outcomes — Lost and Cancelled — are kept separate from the run of work.",
          },
          {
            kind: "callout",
            tone: "info",
            title: "Renaming is safe; the rules underneath do not move",
            body: "Which stage can follow which, and the blockers between them, are part of how the portal works rather than settings. Renaming *Uplift Sent* changes the words on screen, not the requirement that a quote be internally approved before it is issued.",
          },
        ],
      },
      {
        id: "access",
        heading: "Roles & access",
        blocks: [
          {
            kind: "text",
            body: "A grid of View and Edit switches for Manager, Finance and Staff, covering each part of the app. Covered in full in [Roles and what each can do](/docs/roles-and-access).",
          },
        ],
      },
      {
        id: "automations",
        heading: "Automations",
        blocks: [
          {
            kind: "text",
            body: "A read-only list of everything the portal does on its own as a project moves. Worth reading once so the automatic tasks and status changes are recognisable when they appear. See [What happens automatically](/docs/automations-reference).",
          },
        ],
      },
    ],
  },
  {
    slug: "integrations",
    title: "Xero and SharePoint",
    summary: "What syncs, in which direction, and what to check when something does not arrive.",
    audience: ["Owner", "Administrator", "Finance"],
    appHref: "/finance",
    appLabel: "Finance",
    sections: [
      {
        id: "connecting",
        heading: "Connecting Xero",
        blocks: [
          {
            kind: "steps",
            items: [
              "Go to **Finance** and find the Xero panel at the foot of the screen.",
              "Press connect and sign in to Xero, choosing the organisation to link.",
              "Approve the permissions. The panel then shows the connected organisation.",
              "Set the **revenue account** the exported documents should post to.",
            ],
          },
          {
            kind: "text",
            body: "Only one Xero organisation is connected at a time. Disconnecting and reconnecting to a different one is possible but re-points every future export, so it is not something to do casually.",
          },
        ],
      },
      {
        id: "directions",
        heading: "What moves, and which way",
        blocks: [
          {
            kind: "table",
            columns: ["Thing", "Direction", "Notes"],
            rows: [
              ["Materials", "Xero → portal only", "Never written back. Create and edit items in Xero."],
              ["Customers", "Both ways", "Adds and edits sync both directions. Archiving is never pushed by the sync."],
              ["Quotes", "Portal → Xero", "Created as a draft. Edits made in Xero are not read back."],
              ["Invoices", "Portal → Xero", "Created as a draft from the app's own quote lines."],
              ["Payments", "Xero → portal", "Refreshed on demand, so a job can be closed on the evidence of payment."],
            ],
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Everything the portal creates in Xero is a draft",
            body: "Nothing is ever approved or sent to a customer automatically. A person approves and sends it in Xero.",
          },
        ],
      },
      {
        id: "deep-links",
        heading: "Links into Xero",
        blocks: [
          {
            kind: "text",
            body: "Once a quote or invoice exists in Xero, the portal shows its number as a link that opens the document in Xero in a new tab — addressed to the right Xero organisation, so a bookkeeper signed into more than one does not land in the wrong set of books.",
          },
          {
            kind: "text",
            body: "If the link is plain text rather than a hyperlink, the portal has not been able to read the organisation's short code yet. The number is still correct; only the shortcut is missing.",
          },
        ],
      },
      {
        id: "sharepoint",
        heading: "SharePoint",
        blocks: [
          {
            kind: "text",
            body: "The portal has access to one SharePoint site and creates a folder per project inside it. It works on the folder's identity rather than its path, so folders can be renamed and moved in SharePoint without breaking the links here.",
          },
          {
            kind: "text",
            body: "If a folder fails to create, the project's Documents tab offers **Retry**. See [Documents and SharePoint](/docs/documents).",
          },
        ],
      },
      {
        id: "troubles",
        heading: "When something does not arrive",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "A quote or invoice will not export",
                body: "Check the message under the button. The usual causes are a lapsed Xero connection, or a material that is not linked to a Xero item — one unrecognised item code fails the whole document. Re-sync materials and try again.",
              },
              {
                term: "A customer edit did not stick",
                body: "Almost always the same customer being edited in Xero at the same time. The next sync pulls Xero's version down over yours.",
              },
              {
                term: "A quote looks wrong in Xero",
                body: "Nothing is read back from Xero. If it was edited there, edit it here too, or the costing and the eventual invoice will be built from different numbers.",
              },
              {
                term: "An invoice exists in Xero but the portal will not export",
                body: "The duplicate guard is keyed on the project. If somebody raised the invoice by hand in Xero, the portal cannot see it — check Xero before assuming the job is unbilled.",
              },
            ],
          },
        ],
      },
    ],
  },
];
