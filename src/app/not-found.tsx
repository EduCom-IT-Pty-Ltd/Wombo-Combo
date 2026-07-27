import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">404</p>
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        That project, customer or page doesn&apos;t exist — or it belongs to another organisation.
      </p>
      <ButtonLink href="/" variant="primary" className="mt-2">
        Back to dashboard
      </ButtonLink>
    </div>
  );
}
