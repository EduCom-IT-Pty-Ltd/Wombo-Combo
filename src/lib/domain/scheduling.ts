/**
 * Spec: "Scheduling — calendar, installer allocation, leave conflict detection."
 * Conflict detection is pure so the scheduling board can run it optimistically
 * on the client and the server action can re-run it authoritatively on save.
 */

export interface Interval {
  startsAt: Date;
  endsAt: Date;
}

export interface AssignmentLike extends Interval {
  id: string;
  userId: string;
  projectId: string;
  projectNumber?: string;
  status: string;
}

export interface LeaveLike extends Interval {
  id: string;
  userId: string;
  type: string;
  status: string;
}

export type ConflictKind = "double_booked" | "on_leave" | "leave_requested" | "outside_certification";

export interface Conflict {
  kind: ConflictKind;
  userId: string;
  message: string;
  /** Blocking conflicts fail the save; advisory ones surface a warning. */
  severity: "block" | "warn";
  conflictingId?: string;
}

export function overlaps(a: Interval, b: Interval): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

export function detectConflicts(
  candidate: { userId: string; startsAt: Date; endsAt: Date; excludeAssignmentId?: string },
  existingAssignments: AssignmentLike[],
  leave: LeaveLike[],
): Conflict[] {
  const conflicts: Conflict[] = [];

  for (const a of existingAssignments) {
    if (a.userId !== candidate.userId) continue;
    if (a.id === candidate.excludeAssignmentId) continue;
    if (a.status === "cancelled" || a.status === "declined") continue;
    if (!overlaps(candidate, a)) continue;

    conflicts.push({
      kind: "double_booked",
      userId: candidate.userId,
      severity: a.status === "confirmed" ? "block" : "warn",
      message: `Already allocated to ${a.projectNumber ?? "another job"} during this window`,
      conflictingId: a.id,
    });
  }

  for (const l of leave) {
    if (l.userId !== candidate.userId) continue;
    if (l.status === "declined" || l.status === "cancelled") continue;
    if (!overlaps(candidate, l)) continue;

    const approved = l.status === "approved";
    conflicts.push({
      kind: approved ? "on_leave" : "leave_requested",
      userId: candidate.userId,
      severity: approved ? "block" : "warn",
      message: approved
        ? `On approved ${l.type.replace("_", " ")} leave for part of this window`
        : `Has a pending ${l.type.replace("_", " ")} leave request overlapping this window`,
      conflictingId: l.id,
    });
  }

  return conflicts;
}

export function isBlocked(conflicts: Conflict[]): boolean {
  return conflicts.some((c) => c.severity === "block");
}

/** Installers with no blocking conflict in the window, for the allocation picker. */
export function availableInstallers<T extends { userId: string }>(
  candidates: T[],
  window: Interval,
  existingAssignments: AssignmentLike[],
  leave: LeaveLike[],
): Array<T & { conflicts: Conflict[]; available: boolean }> {
  return candidates.map((c) => {
    const conflicts = detectConflicts({ userId: c.userId, ...window }, existingAssignments, leave);
    return { ...c, conflicts, available: !isBlocked(conflicts) };
  });
}
