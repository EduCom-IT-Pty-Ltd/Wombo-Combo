import { getQuoteDocumentTemplateSettings } from "@/lib/data/repository";
import { QuoteLetterheadDesigner } from "@/components/admin/quote-letterhead-designer";
import { requireSettingsAccess } from "../guard";

export const metadata = { title: "Quote document · Settings" };

export default async function QuoteTemplateSettingsPage() {
  const session = await requireSettingsAccess();
  const template = await getQuoteDocumentTemplateSettings(session.org.id);
  return <QuoteLetterheadDesigner settings={template} />;
}
