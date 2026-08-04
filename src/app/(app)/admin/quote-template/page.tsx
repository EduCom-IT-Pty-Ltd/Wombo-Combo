import { readQuoteDocumentTemplateSettings } from "@/lib/data/local-store";
import { QuoteLetterheadDesigner } from "@/components/admin/quote-letterhead-designer";

export const metadata = { title: "Quote document · Settings" };

export default async function QuoteTemplateSettingsPage() {
  const template = await readQuoteDocumentTemplateSettings();
  return <QuoteLetterheadDesigner settings={template} />;
}
