"use server";

import { z } from "zod";
import { requireCapability } from "@/lib/auth/session";
import { sendSupportTicket } from "@/lib/integrations/graph/mail";

export type SupportTicketActionState = { ok: boolean; message?: string };

const ticketSchema = z.object({
  kind: z.enum(["issue", "feature_request"]),
  message: z.string().trim().min(5, "Please add a little more detail.").max(4_000, "Keep the ticket under 4,000 characters."),
});

export async function submitSupportTicket(
  _previous: SupportTicketActionState,
  formData: FormData,
): Promise<SupportTicketActionState> {
  // Every signed-in portal role can view projects, making this a reliable
  // existing capability gate without adding a configurable permission surface.
  const session = await requireCapability("project.view");
  const parsed = ticketSchema.safeParse({
    kind: formData.get("kind"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the ticket details and try again." };

  const name = [session.user.firstName, session.user.lastName].filter(Boolean).join(" ").trim() || session.user.email;
  const result = await sendSupportTicket({
    ...parsed.data,
    submitter: { name, email: session.user.email.trim().toLowerCase() },
  });

  if (result.status === "sent") return { ok: true, message: "Ticket sent. The team can reply directly to your email." };
  if (result.status === "failed") console.error("Support ticket email failed:", result.message);
  return { ok: false, message: "The ticket could not be sent right now. Please try again shortly." };
}
