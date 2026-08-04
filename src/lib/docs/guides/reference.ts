import type { DocGuide } from "../types";

export const REFERENCE_GUIDES: DocGuide[] = [
  {
    slug: "automations-reference",
    title: "What happens automatically",
    summary: "Every automatic task, status change and notification, and what sets each one off.",
    audience: ["Everyone"],
    appHref: "/admin/automations",
    appLabel: "Automations",
    sections: [
      {
        id: "table",
        heading: "The rules",
        blocks: [
          {
            kind: "text",
            body: "Each row fires when its trigger happens. The live list is on **Settings → Automations**.",
          },
          {
            kind: "table",
            columns: ["When this happens", "The portal does this"],
            rows: [
              ["A project is created", "Allocates the project number and creates the SharePoint folder."],
              [
                "A quote is accepted",
                "Moves the job to PO Received, raises a task to request the purchase order, and notifies the customer.",
              ],
              ["A purchase order is received", "Moves the job to Scheduling Pending and notifies the project manager."],
              ["A job is scheduled", "Notifies the installers and confirms the install date with the customer."],
              [
                "Installation is marked complete",
                "Moves the job to QA, raises the QA inspection and its task, and notifies the project manager.",
              ],
              [
                "QA passes",
                "Generates the completion certificate, moves the job to Ready to Invoice, and sends the certificate to the customer.",
              ],
              [
                "Final costing is signed off",
                "Moves the job to Certificate Issued, queues the invoice export and notifies Finance.",
              ],
              ["The invoice is paid", "Marks the project financially complete and closes it."],
            ],
          },
        ],
      },
      {
        id: "in-activity",
        heading: "Seeing them happen",
        blocks: [
          {
            kind: "text",
            body: "Every automatic action is written to the project's **Activity** tab, marked as an automation rather than attributed to a person. If you are ever unsure whether something was done by a colleague or by the system, that is where to look.",
          },
        ],
      },
      {
        id: "failures",
        heading: "When an automation fails",
        blocks: [
          {
            kind: "callout",
            tone: "info",
            title: "A failed automation never undoes your change",
            body: "If a notification cannot send or a folder cannot be created, the failure is recorded and the rest continues. The status change a person just made always stands — the portal does not roll back your work because an email bounced.",
          },
          {
            kind: "text",
            body: "The practical effect is that the odd follow-up may need doing by hand. The Activity trail shows which effect did not complete.",
          },
        ],
      },
    ],
  },
  {
    slug: "troubleshooting",
    title: "Troubleshooting",
    summary: "The things people ask most often, and what to do about each.",
    audience: ["Everyone"],
    sections: [
      {
        id: "access",
        heading: "Access and what I can see",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "I signed in but got “You don't have access”",
                body: "Your sign-in worked; your account just is not on this workspace's member list. Ask whoever invited you to add your email address, then sign in again.",
              },
              {
                term: "A colleague has a menu item I do not",
                body: "Navigation is filtered by role. This is expected. If you genuinely need a module, ask an Owner or Administrator to check **Settings → Roles & access**.",
              },
              {
                term: "A project tab is missing",
                body: "Same reason. Costing needs the profit permission, Quote needs quoting, QA needs QA. A tab you cannot open is hidden rather than shown empty.",
              },
              {
                term: "I cannot see any money anywhere",
                body: "Financial visibility is split into revenue, material cost, labour cost and profit. Staff hold none of them by default.",
              },
              {
                term: "The Archive or Delete option is not there",
                body: "Archiving and deleting projects are Owner and Administrator only, and cannot be granted to another role.",
              },
            ],
          },
        ],
      },
      {
        id: "workflow-problems",
        heading: "The workflow will not let me through",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "The stage I want is not in the list",
                body: "Moves are an explicit list — you cannot skip a stage. Check [The project workflow](/docs/project-lifecycle) for what can follow what.",
              },
              {
                term: "It says a requirement is not met",
                body: "That is a blocker. Fix the underlying thing — approve the quote, attach the PO, allocate an installer, close the critical defects — and the move becomes available.",
              },
              {
                term: "It is asking me for a reason",
                body: "That is a warning rather than a blocker. You can proceed, but the reason is recorded in the Activity trail against your name.",
              },
              {
                term: "A required detail is blocking me",
                body: "The stepper marks anything mandatory. Fill it in under **Project details** on the current stage and save.",
              },
              {
                term: "I put a job on hold and lost my place",
                body: "You have not. Taking it off hold returns it to the exact stage it was held from.",
              },
            ],
          },
        ],
      },
      {
        id: "xero-problems",
        heading: "Xero",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "A quote or invoice will not export",
                body: "Read the message under the button. Usually either the Xero connection has lapsed — reconnect from Finance — or a material is not linked to a Xero item. One unrecognised item code fails the whole document, so re-sync materials and try again.",
              },
              {
                term: "I edited a customer here and it changed back",
                body: "The same customer was almost certainly edited in Xero too. Xero's version wins on the next sync. Edit in one place at a time.",
              },
              {
                term: "I edited a quote in Xero and the portal still shows the old figures",
                body: "Nothing is read back from Xero. Make the same change here, or the costing and the invoice will disagree.",
              },
              {
                term: "The portal says the project is already invoiced",
                body: "The duplicate guard is per project. If the invoice was raised by hand in Xero, the portal cannot see it — check Xero before exporting again.",
              },
              {
                term: "There is no add-material button",
                body: "Correct, and deliberate. Materials come from Xero; a material created here loses its item link and its quote lines stop carrying a code. Add it in Xero, then sync.",
              },
            ],
          },
        ],
      },
      {
        id: "field-problems",
        heading: "On site",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "I forgot to check out",
                body: "Tell the office. A manager can correct the time entry from the project's Field tab. Leaving it makes the job's labour cost look far worse than it was.",
              },
              {
                term: "I checked in on the wrong job",
                body: "Check out, then check in on the right one, and ask the office to remove the wrong entry.",
              },
              {
                term: "My job is not on My Day",
                body: "My Day shows Call-Ups assigned to you. If the job is not there, no Call-Up has been assigned to you for it yet — ask the scheduler.",
              },
              {
                term: "A form will not submit",
                body: "Check your signal. Nothing is lost while the form is still open — try again once you have reception.",
              },
            ],
          },
        ],
      },
      {
        id: "documents-problems",
        heading: "Documents",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "The project has no SharePoint folder",
                body: "Press **Retry** on the Documents tab. Folder creation can fail transiently and does not need the project recreating.",
              },
              {
                term: "Somebody renamed the folder in SharePoint",
                body: "No problem. The link follows the folder's identity, not its path.",
              },
            ],
          },
        ],
      },
      {
        id: "costing-problems",
        heading: "Costing looks wrong",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "The Costing tab says there is no data",
                body: "It needs a generated quote, plus labour or subcontractor options set. Build the quote first.",
              },
              {
                term: "Labour cost is much higher than expected",
                body: "Look for a shift somebody left running. Open shifts keep counting, and the job's labour cost is built from logged time.",
              },
              {
                term: "I changed someone's rate and old jobs did not move",
                body: "That is intended. Rates are copied onto each time entry at check-in, so finished work keeps the rate that applied when it was done.",
              },
              {
                term: "Subcontractor cost is not being deducted",
                body: "It only applies to projects where it has been switched on, on the project's own Costing tab.",
              },
            ],
          },
        ],
      },
      {
        id: "still-stuck",
        heading: "Still stuck",
        blocks: [
          {
            kind: "text",
            body: "The project's **Activity** tab is an append-only record of every change, who made it and when — including anything the portal did on its own. For most *why did this happen?* questions, the answer is already there.",
          },
        ],
      },
    ],
  },
];
