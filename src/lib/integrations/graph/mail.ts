import "server-only";
import type { Person, ProjectDetail, SchedulePhaseView } from "@/lib/data/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

type CallUpNotificationAction = "created" | "updated" | "cancelled";

export type SupportTicketKind = "issue" | "feature_request";

export type CallUpNotificationResult =
  | { status: "sent"; recipientCount: number }
  | { status: "skipped"; reason: "not_configured" | "no_recipients" }
  | { status: "failed"; message: string };

export type SupportTicketResult =
  | { status: "sent" }
  | { status: "skipped"; reason: "not_configured" }
  | { status: "failed"; message: string };

// These recipients deliberately live only in this server-only module. They
// cannot be viewed or changed from the portal, nor can a browser submit a
// ticket to another address.
const SUPPORT_TICKET_RECIPIENTS = [
  "kpike@educomit.com.au",
  "amorrisroe@educomit.com.au",
  "ehodkinson@educomit.com.au",
] as const;

let cachedToken: { value: string; expiresAt: number } | null = null;

function mailConfigured() {
  return Boolean(
    process.env.MS_GRAPH_TENANT_ID &&
      process.env.MS_GRAPH_MAIL_CLIENT_ID &&
      process.env.MS_GRAPH_MAIL_CLIENT_SECRET &&
      process.env.MS_GRAPH_MAILBOX,
  );
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Australia/Brisbane",
  }).format(new Date(`${date}T12:00:00+10:00`));
}

async function getToken() {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const tenant = process.env.MS_GRAPH_TENANT_ID;
  const clientId = process.env.MS_GRAPH_MAIL_CLIENT_ID;
  const clientSecret = process.env.MS_GRAPH_MAIL_CLIENT_SECRET;
  if (!tenant || !clientId || !clientSecret) throw new Error("Microsoft Graph email is not configured.");

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string; error?: string };
  if (!response.ok || !body.access_token) {
    throw new Error(body.error_description ?? body.error ?? "Microsoft Graph could not issue an email access token.");
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + ((body.expires_in ?? 3600) - 60) * 1000,
  };
  return cachedToken.value;
}

function recipientAddresses(assignee: Person | undefined) {
  // Call-Up notifications are internal allocation notices. Customer contact
  // details deliberately never enter this recipient list.
  const email = assignee?.email.trim();
  return email ? [email.toLowerCase()] : [];
}

function emailContent(args: {
  action: CallUpNotificationAction;
  project: ProjectDetail;
  phase: Pick<SchedulePhaseView, "title" | "description" | "date">;
  assignee: Person | undefined;
}) {
  const { action, project, phase, assignee } = args;
  const actionLabel = action === "created" ? "scheduled" : action === "updated" ? "updated" : "cancelled";
  const site = project.site?.address || project.siteLabel || "Site address to be confirmed";
  const heading = action === "cancelled" ? "Call-Up cancelled" : `Call-Up ${actionLabel}`;
  const subject = `${heading} · ${project.projectNumber} · ${formatDate(phase.date)}`;
  const rows = [
    ["Project", `${project.projectNumber} · ${project.title}`],
    ["Call-Up", phase.title],
    ["Date", formatDate(phase.date)],
    ["Site", site],
    ...(assignee ? [["Assigned to", assignee.name]] : []),
    ...(phase.description ? [["Details", phase.description]] : []),
  ];
  const body = `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55;max-width:620px">
      <h2 style="margin:0 0 16px">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 20px">${action === "cancelled" ? "This Call-Up has been cancelled." : "Please note the Call-Up details below."}</p>
      <table style="border-collapse:collapse;width:100%">
        ${rows.map(([label, value]) => `<tr><td style="padding:9px 12px;border:1px solid #dbe2ea;background:#f5f7fa;font-weight:700;width:34%">${escapeHtml(label)}</td><td style="padding:9px 12px;border:1px solid #dbe2ea">${escapeHtml(value)}</td></tr>`).join("")}
      </table>
      <p style="margin:20px 0 0;color:#5b667a;font-size:13px">This is an automated notification from EnviroShield Insulation.</p>
    </div>`;
  return { subject, body };
}

/**
 * Deliberately returns failures instead of throwing. A Call-Up is an operational
 * record and must save even if Microsoft 365 is unavailable; the caller records
 * the mail result in project activity for the office to follow up.
 */
export async function sendCallUpNotification(args: {
  action: CallUpNotificationAction;
  project: ProjectDetail;
  phase: Pick<SchedulePhaseView, "title" | "description" | "date">;
  assignee: Person | undefined;
}): Promise<CallUpNotificationResult> {
  if (!mailConfigured()) return { status: "skipped", reason: "not_configured" };

  const recipients = recipientAddresses(args.assignee);
  if (recipients.length === 0) return { status: "skipped", reason: "no_recipients" };

  try {
    const token = await getToken();
    const mailbox = process.env.MS_GRAPH_MAILBOX!;
    const { subject, body } = emailContent(args);
    const response = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: body },
          toRecipients: recipients.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Microsoft Graph returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    }
    return { status: "sent", recipientCount: recipients.length };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Microsoft Graph could not send the email." };
  }
}

/**
 * Sends a fixed-recipient internal portal ticket from the existing Graph
 * notifications mailbox. The submitting user's address is Reply-To only, so
 * staff can respond directly without exposing or trusting any recipient input.
 */
export async function sendSupportTicket(args: {
  kind: SupportTicketKind;
  message: string;
  submitter: { name: string; email: string };
}): Promise<SupportTicketResult> {
  if (!mailConfigured()) return { status: "skipped", reason: "not_configured" };

  const typeLabel = args.kind === "issue" ? "Issue" : "Feature request";
  const subject = `[Portal ${typeLabel.toLowerCase()}] ${args.submitter.name}`;
  const body = `
    <div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55;max-width:620px">
      <h2 style="margin:0 0 16px">Portal ${escapeHtml(typeLabel)}</h2>
      <table style="border-collapse:collapse;width:100%;margin:0 0 20px">
        <tr><td style="padding:9px 12px;border:1px solid #dbe2ea;background:#f5f7fa;font-weight:700;width:34%">Submitted by</td><td style="padding:9px 12px;border:1px solid #dbe2ea">${escapeHtml(args.submitter.name)}</td></tr>
        <tr><td style="padding:9px 12px;border:1px solid #dbe2ea;background:#f5f7fa;font-weight:700;width:34%">Email</td><td style="padding:9px 12px;border:1px solid #dbe2ea"><a href="mailto:${escapeHtml(args.submitter.email)}">${escapeHtml(args.submitter.email)}</a></td></tr>
      </table>
      <p style="margin:0 0 8px;font-weight:700">Details</p>
      <div style="padding:12px;border:1px solid #dbe2ea;background:#f8fafc;white-space:pre-wrap">${escapeHtml(args.message)}</div>
      <p style="margin:20px 0 0;color:#5b667a;font-size:13px">Reply to this email to respond directly to the portal user.</p>
    </div>`;

  try {
    const token = await getToken();
    const mailbox = process.env.MS_GRAPH_MAILBOX!;
    const response = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox)}/sendMail`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "HTML", content: body },
          toRecipients: SUPPORT_TICKET_RECIPIENTS.map((address) => ({ emailAddress: { address } })),
          replyTo: args.submitter.email ? [{ emailAddress: { address: args.submitter.email, name: args.submitter.name } }] : undefined,
        },
        saveToSentItems: true,
      }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Microsoft Graph returned ${response.status}${detail ? `: ${detail.slice(0, 400)}` : ""}`);
    }
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : "Microsoft Graph could not send the email." };
  }
}
