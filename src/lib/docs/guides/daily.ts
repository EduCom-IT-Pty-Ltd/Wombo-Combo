import type { DocGuide } from "../types";

export const DAILY_GUIDES: DocGuide[] = [
  {
    slug: "project-lifecycle",
    title: "The project workflow",
    summary: "Every stage a job passes through, what has to be true to move on, and how to pause or lose one.",
    audience: ["Manager", "Owner", "Administrator"],
    appHref: "/projects",
    appLabel: "Projects",
    sections: [
      {
        id: "stages",
        heading: "The stages",
        blocks: [
          {
            kind: "text",
            body: "A job moves through twelve stages from request to complete. These are the names it ships with — yours may differ, because they can be renamed in **Settings → Project workflow**.",
          },
          {
            kind: "table",
            columns: ["Stage", "Means"],
            rows: [
              ["Request Received", "Customer, site, scope and attachments captured."],
              ["Uplift Sent", "Quote issued to the customer."],
              ["Quoting", "Labour, materials and supplier costs being estimated."],
              ["PO Received", "Quote accepted. Purchase order and deposit outstanding."],
              ["Scheduling Pending", "PO received. Queued for the scheduling board."],
              ["Job Scheduled", "Installers allocated and notified."],
              ["Installation in Progress", "Crew on site. Time, materials and photos being captured."],
              ["Installation Complete", "Install signed off by the crew. QA task raised automatically."],
              ["QA Complete", "Inspection checklist done. Defects tracked to closure."],
              ["Ready to Invoice", "Labour, materials and variations collated into profitability."],
              ["Certificate Issued", "Costing locked. Queued for export to Xero."],
              ["Complete", "Invoice paid and project financially closed."],
            ],
          },
          {
            kind: "text",
            body: "Three more stages sit outside the run: **On Hold**, **Lost** and **Cancelled**.",
          },
        ],
      },
      {
        id: "moving",
        heading: "Moving a project on",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the project. The stepper sits above the tabs.",
              "Work through the **Stage checklist** for the current stage and fill in any **Project details** it asks for. Anything marked *Mandatory before progressing* has to be filled in first.",
              "Pick the stage you are moving to. Only stages you are actually allowed to move to are offered.",
              "Confirm. The change is written to the Activity trail with your name against it, and any automations for that stage fire.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "You cannot skip stages",
            body: "The moves are an explicit list, not free choice. A job at Request Received can go to Quoting, On Hold, Lost or Cancelled — nothing else. This is what lets the automations trust that the stage before actually happened.",
          },
        ],
      },
      {
        id: "blockers",
        heading: "Blockers and warnings",
        blocks: [
          {
            kind: "text",
            body: "Some stages have entry requirements. There are two kinds, and they behave differently.",
          },
          {
            kind: "definitions",
            items: [
              {
                term: "Blocker",
                body: "Stops the move outright and tells you what is missing. Fix the underlying thing — approve the quote, attach the PO, allocate an installer — and the move becomes available.",
              },
              {
                term: "Warning",
                body: "Lets you through, but asks for a reason first. The reason is recorded in the Activity trail against your name.",
              },
            ],
          },
          {
            kind: "table",
            columns: ["Moving to", "Requirement", "Kind"],
            rows: [
              ["Uplift Sent", "A quote must be internally approved before it is issued", "Blocker"],
              ["PO Received", "Record the customer's acceptance against a quote version", "Blocker"],
              ["Scheduling Pending", "Purchase order received and attached", "Blocker"],
              ["Scheduling Pending", "Deposit received", "Warning"],
              ["Job Scheduled", "At least one installer allocated and confirmed", "Blocker"],
              ["Job Scheduled", "Start and finish dates set", "Blocker"],
              ["Installation Complete", "All installation tasks closed out", "Warning"],
              ["Ready to Invoice", "QA inspection passed", "Blocker"],
              ["Ready to Invoice", "No open critical defects", "Blocker"],
              ["Certificate Issued", "Final costing signed off", "Blocker"],
              ["Complete", "Invoice marked paid in Xero", "Warning"],
            ],
          },
        ],
      },
      {
        id: "going-backwards",
        heading: "Going backwards",
        blocks: [
          {
            kind: "text",
            body: "Work does not always go forwards, and the workflow allows for it.",
          },
          {
            kind: "bullets",
            items: [
              "A failed QA inspection sends the job back to **Installation in Progress** for the crew to rectify.",
              "A job at **Ready to Invoice** can go back to **QA Complete** if something is found late.",
              "A quote that needs reworking can drop back to **Quoting** from Uplift Sent, Awaiting Approval or PO Received.",
              "A **Lost** job can be revived back into **Quoting** — useful when a customer comes back months later.",
            ],
          },
        ],
      },
      {
        id: "hold-lost-cancelled",
        heading: "On Hold, Lost and Cancelled",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "On Hold",
                body: "Pauses a job wherever it is. The portal remembers the stage it was held from, and when you take it off hold it goes straight back there — you never have to work out where it was up to.",
              },
              { term: "Lost", body: "The quote was declined or the customer went elsewhere. Can be revived into Quoting later." },
              { term: "Cancelled", body: "Withdrawn before completion. This is the end of the road for that project record." },
            ],
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Hold beats cancel",
            body: "If a job might come back, put it on hold rather than cancelling it. On hold keeps the quote, the documents and the history intact and resumes exactly where it stopped.",
          },
        ],
      },
      {
        id: "board",
        heading: "The projects board",
        blocks: [
          {
            kind: "text",
            body: "**Projects** opens on the active board, grouped by stage, with tabs across the top for **Active**, **Lost**, **Complete**, **Cancelled** and **Archived**. If your role can move projects on, you can change a job's stage straight from the board without opening it.",
          },
          {
            kind: "text",
            body: "Archiving hides a project from everyone's list without deleting it, and it can be restored later. Both archiving and deleting are Owner and Administrator only — see [Roles and what each can do](/docs/roles-and-access).",
          },
        ],
      },
    ],
  },
  {
    slug: "customers",
    title: "Customers",
    summary: "Adding accounts, keeping them in step with Xero, price lists and default templates.",
    audience: ["Manager", "Finance", "Administrator"],
    appHref: "/customers",
    appLabel: "Customers",
    sections: [
      {
        id: "xero-truth",
        heading: "Xero is the source of truth",
        blocks: [
          {
            kind: "text",
            body: "Customers live in Xero, and the portal keeps a mirror of them. Unlike materials, this sync runs **both ways**: create, edit or archive a customer here and the same change is pushed up to Xero; press **Sync from Xero** and changes made in Xero come down.",
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Never edit the same customer in both places at once",
            body: "The sync pulls Xero's version down. A change made only in Xero while you were mid-edit here will win on the next sync, and it will look as though your save did not stick.",
          },
        ],
      },
      {
        id: "adding",
        heading: "Adding a customer",
        blocks: [
          {
            kind: "steps",
            items: [
              "**Customers → Add customer**.",
              "Fill in the name and contact details. Name is the only thing genuinely required.",
              "Save. The customer is created here and in Xero at the same time.",
            ],
          },
          {
            kind: "text",
            body: "If the customer already exists in Xero, press **Sync from Xero** instead of typing them in — you will get their details and the link between the two systems in one step.",
          },
        ],
      },
      {
        id: "sync",
        heading: "Syncing from Xero",
        blocks: [
          {
            kind: "text",
            body: "**Sync from Xero** pulls down every active, non-supplier contact, matching first on the Xero link and then on name. It adds contacts it has not seen and updates ones it has.",
          },
          {
            kind: "bullets",
            items: [
              "It never archives anything. Archiving stays a decision a person makes, on one side or the other.",
              "A customer here with no Xero contact is left alone — it may have live projects, and it gets linked to Xero automatically the first time you export a quote or invoice for it.",
              "Suppliers are skipped. Only contacts that are not suppliers come across.",
            ],
          },
        ],
      },
      {
        id: "cleanup",
        heading: "Cleaning up the list",
        blocks: [
          {
            kind: "text",
            body: "Over time the list collects accounts Xero no longer treats as customers — suppliers, and contacts archived in Xero. **Clean up customers** finds them and shows you what it found.",
          },
          {
            kind: "steps",
            items: [
              "Press **Clean up customers** on the Customers screen.",
              "Read the list. Nothing has happened yet — this step only reads and classifies.",
              "Confirm the ones you want gone. They are archived here and move to the **Archived** tab.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "Clean-up does not touch Xero",
            body: "It archives here only. The contacts it finds are suppliers or already archived in Xero, so pushing an archive back up could retire a live supplier record over a tidy-up of this app's list.",
          },
        ],
      },
      {
        id: "defaults",
        heading: "Price lists and default templates",
        blocks: [
          {
            kind: "text",
            body: "Open a customer and use the options menu to set two things that save time on every job for them:",
          },
          {
            kind: "definitions",
            items: [
              {
                term: "Price list",
                body: "A customer-specific set of material prices. Any material without an entry falls back to the standard price. See [Materials and production templates](/docs/materials-and-production).",
              },
              {
                term: "Default project template",
                body: "The template pre-selected when you raise a new project for this customer, so a repeat customer's jobs start at the right stage with the right checklist.",
              },
            ],
          },
        ],
      },
      {
        id: "customer-page",
        heading: "What the customer page tells you",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Every project for that customer, at whatever stage.",
              "Their win rate — quoted jobs that did not end up Lost.",
              "Total revenue, if your role can see revenue figures.",
              "A **New project** button that pre-fills the customer for you.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "new-project",
    title: "Raising a new project",
    summary: "Creating a job from a request, using templates, and what happens automatically.",
    audience: ["Manager", "Owner", "Administrator"],
    appHref: "/projects/new",
    appLabel: "New project",
    sections: [
      {
        id: "create",
        heading: "Creating one",
        blocks: [
          {
            kind: "steps",
            items: [
              "**Projects → New project**. From a customer's page, use **New project** there instead and the customer is filled in for you.",
              "Choose **Standard project** or a template. A template starts the job at a particular stage with its own checklist already set up.",
              "Pick the customer, name the job, and capture the site address and any access notes.",
              "Write the scope of works. This is what the crew reads on site, so write it for them.",
              "Set a requested start date if the customer has asked for one.",
              "Save.",
            ],
          },
        ],
      },
      {
        id: "automatic",
        heading: "What happens the moment you save",
        blocks: [
          {
            kind: "bullets",
            items: [
              "A **project number** is allocated, using the prefix set in Settings → Organisation.",
              "A **SharePoint folder** is created for the job's documents.",
              "The job appears on the board at its starting stage.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "If the folder does not appear",
            body: "The Documents tab has a **Retry** button. A folder that failed to create — usually a transient SharePoint error — can be created after the fact without recreating the project.",
          },
        ],
      },
      {
        id: "templates",
        heading: "Project templates",
        blocks: [
          {
            kind: "text",
            body: "A project template is a starting point: a name, a starting stage, and the checklist that goes with it. They are worth setting up for the job types you do over and over.",
          },
          {
            kind: "text",
            body: "Manage them from the **Templates** button on the Projects screen. Set a customer's default template on their customer page so their jobs always start the same way.",
          },
        ],
      },
      {
        id: "fill-in",
        heading: "Filling in the rest",
        blocks: [
          {
            kind: "text",
            body: "Not everything has to be right at creation. The project options menu — the button beside the title — lets you change the title, customer, site, contact and requested start at any time.",
          },
          {
            kind: "text",
            body: "The purchase order number, deposit and scheduled dates are captured as the job moves through the workflow rather than up front.",
          },
        ],
      },
    ],
  },
  {
    slug: "quoting",
    title: "Building and sending a quote",
    summary: "Production templates to a priced quote, then across to Xero as a draft.",
    audience: ["Manager", "Estimator", "Owner"],
    appHref: "/projects",
    appLabel: "Projects",
    sections: [
      {
        id: "how-it-works",
        heading: "How quoting works here",
        blocks: [
          {
            kind: "text",
            body: "You do not build a quote line by line. You pick one or more **production templates** — reusable models of the materials a type of job needs — and then set the quantity in square metres against each material. Pricing comes from the catalogue automatically.",
          },
          {
            kind: "text",
            body: "There is no quote PDF in this app. A quote's only customer-facing form is the draft Xero produces, which you approve and email from Xero. That keeps one document, with one number on it, in the system the customer's invoice will come from.",
          },
        ],
      },
      {
        id: "build",
        heading: "Building the quote",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the project and go to the **Quote** tab.",
              "Press **Add production** and choose a template. If the template leaves a product variation open, you are asked to choose which variation this job uses.",
              "Enter the quantity in m² against each material. The line total and the subtotal update as you type.",
              "Save the quote. It appears under **Generated quotes** with a reference.",
            ],
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Add more than one production",
            body: "Templates stack. A job that needs two production models gets both added to the same quote, and you can remove one with the × on its chip without losing the other's quantities.",
          },
        ],
      },
      {
        id: "pricing",
        heading: "Where the prices come from",
        blocks: [
          {
            kind: "text",
            body: "Each line shows whether it used the **standard price** or a **customer price**. If the customer has a price list, any material on it uses that price; everything else falls back to the catalogue's standard price. The header of the quote builder tells you which price list is in play.",
          },
          {
            kind: "text",
            body: "To change what a customer pays, edit their price list under [Materials](/docs/materials-and-production) — not the quote. That way the next job for them is right too.",
          },
        ],
      },
      {
        id: "editing",
        heading: "Editing a saved quote",
        blocks: [
          {
            kind: "text",
            body: "A saved quote can still be edited: change quantities, add a material that was not in the template, or remove a line. Adding a material to a saved quote is the escape hatch for the one-off item no template covers.",
          },
        ],
      },
      {
        id: "to-xero",
        heading: "Sending it to Xero",
        blocks: [
          {
            kind: "steps",
            items: [
              "Press **Send to Xero** against the quote.",
              "The quote is created in Xero as a **draft**. The button is replaced by a link showing the Xero quote number.",
              "Open it in Xero, check it, then approve and email it from there.",
            ],
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Everything stops at draft, deliberately",
            body: "The portal never approves or sends anything to a customer. Approving is a decision someone makes while looking at the document, which is the only place the consequences of getting it wrong are visible.",
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Nothing is read back from Xero",
            body: "Edits you make to the quote inside Xero are invisible here. If you change a quote in Xero, change it here too — or the costing and the invoice will be built from different numbers.",
          },
        ],
      },
      {
        id: "invoicing",
        heading: "Invoicing the quote",
        blocks: [
          {
            kind: "text",
            body: "Once the job is done, **Invoice in Xero** raises a draft invoice from that same quote. It needs the Finance permission. See [Costing and invoicing](/docs/costing-and-finance) for the finance-side route and what happens after.",
          },
        ],
      },
      {
        id: "errors",
        heading: "If the export fails",
        blocks: [
          {
            kind: "text",
            body: "The failure message is shown under the button and kept until the next attempt. The usual causes:",
          },
          {
            kind: "bullets",
            items: [
              "**Xero is not connected**, or the connection has lapsed. Reconnect from the Finance screen.",
              "**A material is not linked to a Xero item.** Only materials that came from Xero can carry an item code, and an unrecognised code fails the whole document. Re-sync materials from Xero.",
              "**The customer has no Xero contact yet.** The portal creates one automatically on first export — if that step failed, the message will say so.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "scheduling",
    title: "Calendar and Call-Ups",
    summary: "Putting a job and a person on the calendar, and keeping availability visible.",
    audience: ["Manager", "Scheduler", "Owner"],
    appHref: "/schedule",
    appLabel: "Calendar",
    sections: [
      {
        id: "call-ups",
        heading: "What a Call-Up is",
        blocks: [
          {
            kind: "text",
            body: "A **Call-Up** is one block of work for one person on one project. It is what puts a job on the calendar and on that person's My Day. A job with three crew across two days has several Call-Ups, not one.",
          },
        ],
      },
      {
        id: "adding",
        heading: "Adding a Call-Up",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the project and go to the **Schedule** tab.",
              "Press **Add Call-Up**.",
              "Give it a title, pick the date and assign a person.",
              "Save. It appears immediately on the main Calendar and on that person's My Day.",
            ],
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Leave shows up while you are assigning",
            body: "Approved leave and unavailability are visible in the Call-Up form, so you find out someone is away before you book them, not after.",
          },
        ],
      },
      {
        id: "calendar",
        heading: "The Calendar",
        blocks: [
          {
            kind: "text",
            body: "**Calendar** shows every Call-Up and every unavailable period across the team, by day, week or month. People carry their own colour, set on their profile under [People](/docs/people-and-labour).",
          },
          {
            kind: "bullets",
            items: [
              "Anyone currently clocked on is marked as on site, so you can see at a glance who actually turned up against who was booked.",
              "Field crew get the same calendar filtered to just their own Call-Ups, on **My Day**.",
              "Tapping a Call-Up on My Day opens that job's field view with the time clock at the top.",
            ],
          },
        ],
      },
      {
        id: "scheduling-stage",
        heading: "Getting a job to Job Scheduled",
        blocks: [
          {
            kind: "text",
            body: "Two things have to be true before a project can move to **Job Scheduled**: at least one installer allocated and confirmed, and start and finish dates set. Both are blockers, so the move will not be offered until they are done.",
          },
          {
            kind: "text",
            body: "Once the job is scheduled, the installers and the customer are notified automatically — see [Automations](/docs/automations-reference).",
          },
        ],
      },
      {
        id: "qa-scheduling",
        heading: "Scheduling a QA inspection",
        blocks: [
          {
            kind: "text",
            body: "QA inspections are scheduled the same way, from the project's **QA** tab: assign an inspector and pick a date, and it lands on their calendar alongside their Call-Ups. See [QA and defects](/docs/qa-and-defects).",
          },
        ],
      },
    ],
  },
  {
    slug: "field-work",
    title: "Working on site",
    summary: "The crew's guide: check in, log materials and extra work, check out.",
    audience: ["Staff", "Field crew"],
    appHref: "/field",
    appLabel: "My Day",
    sections: [
      {
        id: "my-day",
        heading: "My Day",
        blocks: [
          {
            kind: "text",
            body: "**My Day** is your home screen. It shows the hours you have logged today, how many Call-Ups you have, and your calendar — your jobs only, nobody else's.",
          },
          {
            kind: "text",
            body: "Tap a Call-Up to open that job. If you are already checked in somewhere, a green bar at the top takes you straight back to it.",
          },
        ],
      },
      {
        id: "clock",
        heading: "Checking in and out",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the job from My Day.",
              "Press **Check in** when you arrive. The timer starts and runs live.",
              "Press **Pause** for a break, and **Resume** when you are back.",
              "Press **Check out** when you leave site.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "Your shift follows you around the app",
            body: "While you are checked in, the top bar shows your running shift on every screen. Tapping it takes you back to the job.",
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Check out at the end of the day",
            body: "An open shift keeps counting. Your logged time is what the job's labour cost is built from, so a shift left running overnight makes the job look unprofitable until someone corrects it.",
          },
        ],
      },
      {
        id: "logging",
        heading: "Logging what happened",
        blocks: [
          {
            kind: "text",
            body: "Four tiles sit under the clock. Each is one short form — none of them asks for a price, a code, or a decision the office should be making.",
          },
          {
            kind: "definitions",
            items: [
              {
                term: "Materials",
                body: "What you used and how much. Pick the unit — each, lineal metres, square metres, hours, kg or boxes.",
              },
              {
                term: "Site note",
                body: "Anything the office needs to know. Access problems, delays, something the customer said on site.",
              },
              {
                term: "Extra work",
                body: "Work outside the scope. Log it as it happens — this is what a variation gets built from, and it is much harder to reconstruct a week later.",
              },
              { term: "Docs", body: "The job's drawings, SWMS and permits." },
            ],
          },
        ],
      },
      {
        id: "job-screen",
        heading: "The rest of the job screen",
        blocks: [
          {
            kind: "text",
            body: "Below the clock are the same tabs the office sees, filtered to what your role can open. In practice the useful ones on site are **Overview** for the scope of works and site access notes, and **Documents** for the drawings.",
          },
          {
            kind: "text",
            body: "You will not see costs or margins anywhere. That is by design, not a fault with your login.",
          },
        ],
      },
      {
        id: "phone-tips",
        heading: "On the phone",
        blocks: [
          {
            kind: "bullets",
            items: [
              "Buttons are sized for gloves. If you are missing them, the screen is probably zoomed — pinch out.",
              "Wide panels scroll sideways on their own. The page does not.",
              "The app needs a signal to save. If a form does not submit, check your reception and try again — nothing is lost while the form is still open.",
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "qa-and-defects",
    title: "QA and defects",
    summary: "Inspections, the checklist, raising defects and getting a job cleared to invoice.",
    audience: ["Manager", "QA inspector", "Owner"],
    appHref: "/qa",
    appLabel: "QA & Compliance",
    sections: [
      {
        id: "raised",
        heading: "Inspections are raised for you",
        blocks: [
          {
            kind: "text",
            body: "When a job is marked **Installation Complete**, a QA inspection is raised automatically and the job appears in the inspection queue on the **QA & Compliance** screen. Nobody has to remember to create one.",
          },
        ],
      },
      {
        id: "scheduling",
        heading: "Scheduling and running one",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the job from the inspection queue, or go to the project's **QA** tab.",
              "Assign an inspector and pick a date. It lands on their calendar with their Call-Ups.",
              "Work through the checklist, marking each item pass or fail and adding a comment where it matters.",
              "Items marked **critical** carry more weight — see below.",
            ],
          },
          {
            kind: "text",
            body: "An inspection ends as **pass**, **pass with defects** or **fail**.",
          },
        ],
      },
      {
        id: "defects",
        heading: "Defects",
        blocks: [
          {
            kind: "text",
            body: "A defect is a specific thing to fix, with a severity, an assignee and a due date. Severity is **minor**, **major** or **critical**.",
          },
          {
            kind: "text",
            body: "The QA & Compliance screen keeps the whole open list across every job, with overdue ones marked, so nothing falls off the end of a project nobody is looking at any more.",
          },
        ],
      },
      {
        id: "clearing",
        heading: "Getting the job cleared",
        blocks: [
          {
            kind: "text",
            body: "Two blockers stand between QA and invoicing, and both have to be satisfied before the job can move to **Ready to Invoice**:",
          },
          {
            kind: "bullets",
            items: ["The QA inspection has passed.", "There are no open **critical** defects."],
          },
          {
            kind: "callout",
            tone: "info",
            title: "A failed inspection sends the job back",
            body: "If the inspection fails, move the project back to **Installation in Progress**. The crew rectifies, and it comes back through QA — the history of both passes stays on the project.",
          },
          {
            kind: "text",
            body: "Minor and major defects do not block invoicing. Only critical ones do.",
          },
        ],
      },
      {
        id: "certificate",
        heading: "The completion certificate",
        blocks: [
          {
            kind: "text",
            body: "Passing QA generates the completion certificate as an artefact of the project — it is not a workflow stage of its own. It lands with the project's documents.",
          },
        ],
      },
    ],
  },
  {
    slug: "documents",
    title: "Documents and SharePoint",
    summary: "Where a job's files live, uploading them, and getting the crew to sign on.",
    audience: ["Everyone"],
    sections: [
      {
        id: "folder",
        heading: "Every project gets a folder",
        blocks: [
          {
            kind: "text",
            body: "A SharePoint folder is created automatically when a project is created, and linked at the top of the project's **Documents** tab. Files put in that folder in SharePoint and files uploaded here end up in the same place.",
          },
          {
            kind: "callout",
            tone: "tip",
            title: "Rename the folder in SharePoint freely",
            body: "The link is to the folder's identity, not its path. Renaming or moving it in SharePoint does not break anything here.",
          },
        ],
      },
      {
        id: "uploading",
        heading: "Uploading",
        blocks: [
          {
            kind: "steps",
            items: [
              "Open the project's **Documents** tab.",
              "Press **Upload**, choose the file, and set what kind of document it is — drawing, SWMS, permit, certificate and so on.",
              "Add a note if the file name will not be obvious to whoever opens it on site.",
              "Tick **sign-on required** if the crew must acknowledge it before starting work.",
            ],
          },
          {
            kind: "text",
            body: "Documents are grouped by kind on the tab, and each shows its version, size, who uploaded it and when. Uploading a file with the same name creates a new version rather than overwriting silently.",
          },
        ],
      },
      {
        id: "on-site",
        heading: "Getting to them on site",
        blocks: [
          {
            kind: "text",
            body: "From My Day, open the job and tap the **Docs** tile. Anything with **Sign-on required** is flagged so the crew know it is not optional reading.",
          },
        ],
      },
      {
        id: "missing-folder",
        heading: "If the folder is missing",
        blocks: [
          {
            kind: "text",
            body: "The Documents tab shows a **Retry** button when the folder was not created. Press it — a transient SharePoint failure at creation time does not need the project recreating. If it keeps failing, the connection itself needs checking; see [Xero and SharePoint](/docs/integrations).",
          },
        ],
      },
    ],
  },
  {
    slug: "costing-and-finance",
    title: "Costing and invoicing",
    summary: "What a job actually made, where each number comes from, and getting the invoice into Xero.",
    audience: ["Finance", "Owner", "Administrator"],
    appHref: "/finance",
    appLabel: "Finance",
    sections: [
      {
        id: "costing-tab",
        heading: "The project Costing tab",
        blocks: [
          {
            kind: "text",
            body: "Every project has a **Costing** tab showing revenue, costs, gross profit and margin. It needs the profit permission, so Managers do not see it by default.",
          },
          {
            kind: "table",
            columns: ["Figure", "Where it comes from"],
            rows: [
              ["Quote revenue", "The latest quote's subtotal, excluding GST."],
              ["Material cost", "The cost side of the quoted materials."],
              ["Labour budget", "The standard per-job labour cost × the employee count set on this project."],
              ["Actual labour", "Completed field clock entries × each person's hourly rate, captured when they clocked in."],
              ["Subcontractor materials", "Quoted m² × the matching subcontractor rate from the Labour module."],
              ["Gross profit", "Revenue less material, actual labour and — when enabled for this project — subcontractor cost."],
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "Rates are snapped at clock-in",
            body: "A person's hourly rate is stored on the time entry when they check in. Giving someone a pay rise does not retrospectively change what last month's finished jobs cost.",
          },
        ],
      },
      {
        id: "labour-variance",
        heading: "Labour variance",
        blocks: [
          {
            kind: "text",
            body: "The costing panel compares budgeted labour against actual and shows the variance as over or under budget. That number, read across several jobs, is the quickest signal that quoting and delivery have drifted apart.",
          },
          {
            kind: "text",
            body: "The budget comes from the standard labour settings and the employee count you set per project. Subcontractor material cost can be included or excluded per project — some jobs are subcontracted, most are not.",
          },
        ],
      },
      {
        id: "finance-screen",
        heading: "The Finance screen",
        blocks: [
          {
            kind: "definitions",
            items: [
              { term: "Work in progress", body: "The value of everything currently in flight." },
              { term: "Ready to invoice", body: "Jobs whose costing is signed off and are queued for Xero." },
              { term: "Quotes outstanding", body: "Quoted value still awaiting a customer decision." },
              { term: "Awaiting PO", body: "Jobs the customer approved that have no purchase order recorded yet." },
            ],
          },
          {
            kind: "text",
            body: "**Margin performance** sits below: quoted margin against achieved margin on every completed job, with the gap in percentage points. Green means the job beat its quote.",
          },
        ],
      },
      {
        id: "invoicing",
        heading: "Raising the invoice",
        blocks: [
          {
            kind: "steps",
            items: [
              "Sign off the final costing and move the job to **Certificate Issued** — it now sits in **Ready for invoice** on the Finance screen.",
              "Press the Xero button on its row in the margin performance table, or **Invoice in Xero** on the project's quote.",
              "A **draft** invoice is created in Xero from the app's own quote lines.",
              "Open it in Xero, check it, approve it and send it.",
            ],
          },
          {
            kind: "callout",
            tone: "warning",
            title: "The duplicate guard is per project, not per invoice",
            body: "The portal will not export the same project twice. It cannot see an invoice someone raised by hand inside Xero, though — so check Xero before exporting a job you think may already have been billed.",
          },
        ],
      },
      {
        id: "closing",
        heading: "Closing the job",
        blocks: [
          {
            kind: "text",
            body: "Once the invoice is paid, move the project to **Complete**. Payment status is a warning rather than a blocker: you can close a job before Xero shows it paid, but you have to give a reason, and that reason is recorded in the Activity trail.",
          },
        ],
      },
    ],
  },
];
