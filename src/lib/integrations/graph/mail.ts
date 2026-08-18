import "server-only";
import type { Person, ProjectDetail, SchedulePhaseView } from "@/lib/data/types";

const GRAPH = "https://graph.microsoft.com/v1.0";

type CallUpNotificationAction = "created" | "updated" | "cancelled";

export type CallUpNotificationResult =
  | { status: "sent"; recipientCount: number }
  | { status: "skipped"; reason: "not_configured" | "no_recipients" }
  | { status: "failed"; message: string };

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

function recipientAddresses(project: ProjectDetail, assignee: Person | undefined) {
  return [...new Set([
    assignee?.email,
    project.customer.primaryContactEmail,
  ].filter((email): email is string => Boolean(email?.trim())).map((email) => email.trim().toLowerCase()))];
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

  const recipients = recipientAddresses(args.project, args.assignee);
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
