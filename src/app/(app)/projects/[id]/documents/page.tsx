import { ExternalLink, FileText, ShieldAlert } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { can } from "@/lib/domain/permissions";
import { listDocuments, listPeople } from "@/lib/data/repository";
import { Badge, Button, Card, CardHeader, EmptyState } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  drawing: "Drawing",
  swms: "SWMS",
  permit: "Permit",
  certificate: "Certificate",
  photo: "Photo",
  purchase_order: "Purchase order",
  quote_pdf: "Quote",
  completion_certificate: "Completion certificate",
  other: "Other",
};

export default async function ProjectDocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  const [documents, people] = await Promise.all([
    listDocuments(session.org.id, id),
    listPeople(session.org.id),
  ]);

  const grouped = documents.reduce<Record<string, typeof documents>>((acc, doc) => {
    (acc[doc.kind] ??= []).push(doc);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader
        title="Documents"
        description="Drawings, SWMS, permits and certificates"
        action={
          can(session.role, "document.upload") ? (
            <Button size="sm" variant="secondary">
              Upload
            </Button>
          ) : null
        }
      />
      {documents.length === 0 ? (
        <EmptyState title="No documents" description="Upload drawings, SWMS and permits so the crew can access them on site." />
      ) : (
        <div className="divide-y divide-border-subtle">
          {Object.entries(grouped).map(([kind, docs]) => (
            <section key={kind}>
              <h3 className="bg-surface-muted px-4 py-1.5 text-xs font-medium text-muted-foreground">
                {KIND_LABELS[kind] ?? kind}
              </h3>
              <ul className="divide-y divide-border-subtle">
                {docs.map((doc) => {
                  const uploader = people.find((p) => p.id === doc.uploadedById);
                  return (
                    <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
                      <FileText className="size-5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        {doc.url ? (
                          <a
                            href={doc.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex min-h-11 items-center gap-1.5 text-sm underline-offset-2 hover:underline"
                          >
                            <span className="truncate">{doc.name}</span>
                            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                          </a>
                        ) : (
                          <p className="truncate text-sm">{doc.name}</p>
                        )}
                        {doc.note ? <p className="text-xs text-muted-foreground">{doc.note}</p> : null}
                        <p className="text-xs text-muted-foreground">
                          v{doc.version} · {formatBytes(doc.sizeBytes)} · {uploader?.name ?? "Unknown"} ·{" "}
                          {formatDate(doc.uploadedAt)}
                        </p>
                      </div>
                      {doc.requiresAcknowledgement ? (
                        <Badge tone="amber">
                          <ShieldAlert className="size-3" /> Sign-on required
                        </Badge>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}
