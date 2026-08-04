import Link from "next/link";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Sits at the foot of every page. Inside the app shell it also carries the
 * clearance the fixed mobile bottom nav needs — `pb-24` there, dropped at `lg`
 * where the bottom nav does not render.
 */
export function SiteFooter({ withGuides = false, className }: { withGuides?: boolean; className?: string }) {
  return (
    <footer
      className={cn(
        "mt-auto border-t border-border-subtle px-4 pt-5 pb-8 sm:px-6 lg:px-8",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
        <p className="text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">EduCom IT</span>
        </p>
        {withGuides ? (
          <Link
            href="/docs"
            className="inline-flex min-h-9 items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <BookOpen className="size-3.5" aria-hidden /> Guides
          </Link>
        ) : null}
      </div>
    </footer>
  );
}
