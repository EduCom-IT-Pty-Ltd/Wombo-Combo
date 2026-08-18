import type { DocGuide } from "../types";

export const START_GUIDES: DocGuide[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    summary: "What the portal is for, how to sign in, and the first thing to do in each role.",
    audience: ["Everyone"],
    appHref: "/",
    appLabel: "Dashboard",
    sections: [
      {
        id: "what-this-is",
        heading: "What the portal does",
        blocks: [
          {
            kind: "text",
            body: "The portal runs a job from the moment a customer asks for a price to the moment the invoice is paid. One project record carries the quote, the schedule, the crew's time on site, the QA inspection, the documents and the final costing — so nobody has to reconcile a spreadsheet against an inbox to find out where something is up to.",
          },
          {
            kind: "text",
            body: "It is built around a single **project workflow**. Every job sits at exactly one stage, and moving between stages is what triggers the rest: a QA inspection is raised when installation is marked complete, a SharePoint folder is created when a project is created, and so on. Learning the workflow is most of learning the app — see [The project workflow](/docs/project-lifecycle).",
          },
        ],
      },
      {
        id: "signing-in",
        heading: "Signing in",
        blocks: [
          {
            kind: "text",
            body: "Access is invite-only. Somebody with Settings access invites your email address, and you receive an email from the sign-in provider to set a password. After that you sign in with email and password.",
          },
          {
            kind: "steps",
            items: [
              "Open the portal address your office gave you.",
              "Enter your work email address and password.",
              "You land on the Dashboard — or, if you are field crew, straight on **My Day**.",
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "“You don't have access”",
            body: "That screen means you signed in successfully but your account is not on this workspace's member list yet. Ask whoever invited you to add your email address, then sign in again. It is not a password problem.",
          },
        ],
      },
      {
        id: "first-things",
        heading: "The first thing to do in your role",
        blocks: [
          {
            kind: "text",
            body: "What matters on day one depends on what you do. Pick the row that fits.",
          },
          {
            kind: "table",
            columns: ["If you are…", "Start here", "Why"],
            rows: [
              [
                "Field crew / installer",
                "[Working on site](/docs/field-work)",
                "Your whole job is My Day: check in, log what you used, check out.",
              ],
              [
                "Project manager",
                "[The project workflow](/docs/project-lifecycle)",
                "Everything else hangs off moving jobs through the stages.",
              ],
              [
                "Estimator / sales",
                "[Building a quote](/docs/quoting)",
                "The visible materials catalogue and customer price lists keep quotes accurate.",
              ],
              [
                "Scheduler",
                "[Calendar and Call-Ups](/docs/scheduling)",
                "Call-Ups are what put a job and a person on the calendar.",
              ],
              [
                "Finance",
                "[Costing and invoicing](/docs/costing-and-finance)",
                "Job costing, margin performance and the Xero export live together.",
              ],
              [
                "Owner / administrator",
                "[Settings](/docs/settings)",
                "Set the company details, the workflow names and who can see what.",
              ],
            ],
          },
        ],
      },
      {
        id: "setup-order",
        heading: "Setting up a brand new workspace",
        blocks: [
          {
            kind: "text",
            body: "If the portal is empty and you are the one filling it, this order avoids rework — each step depends on the one above it.",
          },
          {
            kind: "steps",
            items: [
              "**Settings → Organisation**: company name, project number prefix, currency, timezone and logo. The prefix is baked into every project number from then on, so set it before creating projects.",
              "**Connect Xero** from the Finance screen. Customers and the materials catalogue both come from Xero, so this comes before either.",
              "**Sync customers and materials** from Xero. See [Xero and SharePoint](/docs/integrations).",
              "**Settings → Project workflow**: rename stages to your language and add the checklist items each stage needs.",
              "**People**: add the team, set hourly cost rates and mark who is schedulable.",
              "**Labour**: set the standard labour budget and subcontractor rates so costing has something to compare against.",
              "**Materials**: choose which synced Xero items are visible in the portal and set up any product groups used by estimators.",
              "**Settings → Roles & access**: confirm what Manager, Finance and Staff can see.",
              "Create your first project and walk it through the workflow.",
            ],
          },
          {
            kind: "callout",
            tone: "tip",
            title: "You do not have to do it all at once",
            body: "Only the organisation settings really need to be right up front. Material display choices, labour rates and workflow checklists can all be filled in as you go — the app works without them, it just does less for you.",
          },
        ],
      },
    ],
  },
  {
    slug: "finding-your-way",
    title: "Finding your way around",
    summary: "Navigation, search, the project workspace, dark mode and how the app changes on a phone.",
    audience: ["Everyone"],
    sections: [
      {
        id: "layout",
        heading: "The layout",
        blocks: [
          {
            kind: "definitions",
            items: [
              {
                term: "Sidebar (desktop)",
                body: "Down the left. Only shows the modules your role can open, so two people can see different lists — that is expected, not a fault.",
              },
              {
                term: "Bottom bar (mobile)",
                body: "Four destinations plus **More**. Which four depends on your role: field crew get **My Day** first, office staff get the Dashboard.",
              },
              {
                term: "Top bar",
                body: "Search, your active shift if you are clocked on, the light/dark toggle, and your name and role.",
              },
            ],
          },
        ],
      },
      {
        id: "search",
        heading: "Search",
        blocks: [
          {
            kind: "text",
            body: "The search box in the top bar looks across projects and customers at once. Type a project number, a job name, a site or a customer name and pick from the list — it is usually faster than navigating to Projects and filtering.",
          },
          {
            kind: "callout",
            tone: "info",
            title: "Customers only appear if you can see them",
            body: "Search results are filtered by your permissions. If your role cannot view customers, the search returns projects only.",
          },
        ],
      },
      {
        id: "project-workspace",
        heading: "The project workspace",
        blocks: [
          {
            kind: "text",
            body: "Open any project and you get the same set of tabs. Tabs you cannot access are not shown at all.",
          },
          {
            kind: "table",
            columns: ["Tab", "What lives there"],
            rows: [
              ["Overview", "Scope of works, site and access notes, project manager, PO and deposit, dates, recent activity."],
              ["Quote", "Build a material quote from the visible Xero-synced catalogue, then send it to Xero."],
              ["Schedule", "The project's Call-Ups — who is on site and when."],
              ["Field", "Hours logged, who is on site now, labour cost by person, quoted materials."],
              ["Documents", "The SharePoint folder plus drawings, SWMS, permits and exported documents."],
              ["QA", "The inspection checklist and the defect list."],
              ["Costing", "Revenue, material cost, labour budget vs actual, gross profit and margin."],
              ["Activity", "An append-only audit trail of every change, by person or by automation."],
            ],
          },
          {
            kind: "text",
            body: "Above the tabs sits the **status stepper** — the stage the job is at, its checklist and any details that stage requires. That is where you move a project forward; see [The project workflow](/docs/project-lifecycle).",
          },
        ],
      },
      {
        id: "on-a-phone",
        heading: "On a phone",
        blocks: [
          {
            kind: "text",
            body: "The app is built to be used one-handed on site in daylight, not just squeezed onto a small screen. Buttons are large enough for gloves, text fields do not trigger the zoom-in jump on iOS, and the bottom bar sits clear of the home indicator.",
          },
          {
            kind: "bullets",
            items: [
              "Wide content — tables, the calendar, the quote builder — scrolls sideways inside its own panel. The page itself never scrolls sideways.",
              "Pinch-zoom is deliberately left enabled.",
              "Field crew never need the **More** menu for their normal day: My Day, then the job, is two taps.",
            ],
          },
        ],
      },
      {
        id: "dark-mode",
        heading: "Light and dark",
        blocks: [
          {
            kind: "text",
            body: "The toggle in the top bar switches between light and dark. It is a personal choice stored on your device, not a company setting, and it deliberately ignores your phone's system setting — so the app looks the same at the start and end of a shift.",
          },
        ],
      },
    ],
  },
  {
    slug: "roles-and-access",
    title: "Roles and what each can do",
    summary: "The five roles, what they see by default, and which permissions can be handed out.",
    audience: ["Owner", "Administrator", "Manager"],
    appHref: "/admin/permissions",
    appLabel: "Roles & access",
    sections: [
      {
        id: "roles",
        heading: "The five roles",
        blocks: [
          {
            kind: "table",
            columns: ["Role", "Built for", "Sees by default"],
            rows: [
              ["Owner", "The business owner", "Everything, including archive, delete and company-wide labour rates."],
              ["Administrator", "Whoever runs the system", "Everything, same as Owner."],
              ["Manager", "Project managers and estimators", "Projects, customers, quoting, calendar, documents, QA, People and quoted revenue — but not profit or costs."],
              ["Finance", "Bookkeeping and accounts", "Projects, customers, quotes, documents and the whole Finance module including profit and margins."],
              ["Staff", "Field crew and installers", "My Day, the calendar, projects, documents and QA. No money at all."],
            ],
          },
          {
            kind: "callout",
            tone: "info",
            title: "Field crew get a different app",
            body: "Anyone who can clock on but cannot edit projects is treated as field-only: the Dashboard is skipped entirely and **My Day** becomes their home screen with a stripped-back navigation bar.",
          },
        ],
      },
      {
        id: "editing",
        heading: "Changing what a role can do",
        blocks: [
          {
            kind: "text",
            body: "Go to **Settings → Roles & access**. Each row is a part of the app with a **View** and an **Edit** switch for Manager, Finance and Staff.",
          },
          {
            kind: "bullets",
            items: [
              "Turning on **Edit** always includes **View** — you cannot grant editing to someone who cannot see the screen.",
              "Owner and Administrator are not listed, because they always hold everything.",
              "Changes take effect the next time the person loads a page. Nobody has to sign out and in.",
            ],
          },
        ],
      },
      {
        id: "restricted",
        heading: "Three things that cannot be delegated",
        blocks: [
          {
            kind: "text",
            body: "Archiving projects, deleting projects and managing company-wide labour and subcontractor rates stay with the Owner and Administrator. They are not on the Roles & access screen, and they cannot be granted to another role.",
          },
          {
            kind: "callout",
            tone: "warning",
            title: "Why those three",
            body: "Deleting a project destroys its SharePoint folder along with it, and archiving hides live work from everyone else's list. Both are decisions about the business rather than about a job. Company-wide rates change the costing on every project at once.",
          },
        ],
      },
      {
        id: "money",
        heading: "Money is not one permission",
        blocks: [
          {
            kind: "text",
            body: "Financial visibility is split four ways so you can show someone a number without showing them all of them.",
          },
          {
            kind: "definitions",
            items: [
              { term: "Revenue", body: "Quoted and earned revenue figures. Managers hold this by default." },
              { term: "Material costs", body: "What the materials cost, across projects." },
              { term: "Labour costs", body: "Hourly rates, logged time and what the time cost." },
              { term: "Profit & finance", body: "Margin, gross profit and the whole Finance module. Finance holds this by default; Manager does not." },
            ],
          },
          {
            kind: "text",
            body: "A screen a role cannot see does not appear half-filled — the tab is hidden or the panel says it is not available. Nobody sees a blanked-out number and wonders whether it is zero.",
          },
        ],
      },
    ],
  },
];
