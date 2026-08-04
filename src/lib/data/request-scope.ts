import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";

/**
 * One read cache per request.
 *
 * Rendering a page is not one function call. `generateMetadata`, the layout and
 * the page each run on their own and each asks the repository for what it needs,
 * with no way to hand data between them — so opening a project asked for the
 * same project three times, and every one of those is nine queries.
 *
 * Deduplication belongs here rather than at the call sites because the call
 * sites cannot see each other. A page should stay free to ask for what it needs.
 *
 * `cache()` is React's per-request memo and is what does the work under Next.
 * Outside a render it is a pass-through, so scripts opt in explicitly with
 * `withRequestScope` — which is also what makes the deduplication measurable.
 */
type ReadCache = Map<string, Promise<unknown>>;

const explicitScope = new AsyncLocalStorage<ReadCache>();
const renderScope = cache((): ReadCache => new Map());

function currentScope(): ReadCache {
  return explicitScope.getStore() ?? renderScope();
}

/**
 * Reads sharing a key resolve to the same promise for the rest of the request.
 *
 * Keys are `name:arg:arg`. Two reads may share one only when they would return
 * the same thing — a filtered list is a different key from an unfiltered one.
 */
export function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const scope = currentScope();
  const inFlight = scope.get(key);
  if (inFlight) return inFlight as Promise<T>;

  const pending = load();
  scope.set(key, pending);
  // A rejection is not remembered: one failed read should not be replayed to
  // every later caller in the same request, and Neon's HTTP driver fails
  // transiently often enough for that to matter.
  pending.catch(() => {
    if (scope.get(key) === pending) scope.delete(key);
  });
  return pending;
}

/**
 * Forget everything read so far in this request.
 *
 * For the write path: an action that reads, writes, and then reads again must
 * see its own write. `transitionProject` is the case that exists today — its
 * automations run after the status has committed and are documented as needing
 * to observe the new status.
 */
export function forgetReads(): void {
  currentScope().clear();
}

/**
 * Run `fn` in an explicit scope. Next.js supplies its own per-request scope, so
 * this is for scripts and diagnostics, which have no render to hang one off.
 */
export function withRequestScope<T>(fn: () => T): T {
  return explicitScope.run(new Map(), fn);
}
