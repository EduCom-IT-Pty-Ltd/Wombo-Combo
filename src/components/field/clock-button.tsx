"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { clockOff, clockOn } from "@/app/actions/field";
import { Button } from "@/components/ui";

/**
 * The single most-used control in the app. Full-width, thumb-height, and it
 * shows a live elapsed timer so an installer can confirm at a glance that the
 * clock is actually running.
 */
export function ClockButton({
  projectId,
  openEntry,
}: {
  projectId: string;
  openEntry: { id: string; startedAt: string } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!openEntry) return;
    const tick = () => {
      const ms = Date.now() - new Date(openEntry.startedAt).getTime();
      const h = Math.floor(ms / 3_600_000);
      const m = Math.floor((ms % 3_600_000) / 60_000);
      setElapsed(`${h}h ${String(m).padStart(2, "0")}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [openEntry]);

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  if (openEntry) {
    return (
      <div className="space-y-2">
        <p className="text-center text-sm text-muted-foreground">
          On site · <span className="font-medium tabular-nums text-foreground">{elapsed}</span>
        </p>
        <Button
          size="lg"
          variant="danger"
          className="w-full"
          disabled={pending}
          onClick={() => run(() => clockOff({ entryId: openEntry.id, breakMinutes: 30 }))}
        >
          <Square className="size-5" /> Clock off
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="lg"
      variant="primary"
      className="w-full"
      disabled={pending}
      onClick={() =>
        run(async () => {
          // Best-effort location; a denied prompt must never block clocking on.
          const coords = await new Promise<GeolocationCoordinates | null>((resolve) => {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
              (pos) => resolve(pos.coords),
              () => resolve(null),
              { timeout: 4000 },
            );
          });
          return clockOn({
            projectId,
            latitude: coords?.latitude,
            longitude: coords?.longitude,
          });
        })
      }
    >
      <Play className="size-5" /> Clock on
    </Button>
  );
}
