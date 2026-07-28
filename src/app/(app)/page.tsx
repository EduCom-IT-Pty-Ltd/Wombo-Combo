import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays } from "lucide-react";
import { getSession } from "@/lib/auth/session";
import { isFieldOnly } from "@/lib/domain/permissions";
import { formatMoney } from "@/lib/domain/money";
import { PIPELINE_ORDER, STATUS_META } from "@/lib/domain/status";
import { getDashboardMetrics, listPeople, listProjects, listSchedulePhases } from "@/lib/data/repository";
import { Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { formatDate } from "@/lib/utils";

const CUSTOMER_COLORS = ["#4f46e5", "#0891b2", "#059669", "#d97706", "#db2777", "#7c3aed", "#0284c7", "#be123c"];

export default async function DashboardPage() {
  const session = await getSession();
  if (isFieldOnly(session.role)) redirect("/field");
  const orgId = session.org.id;
  const now = new Date();
  const today = dateKey(now);
  const [metrics, projects, people, callOuts] = await Promise.all([
    getDashboardMetrics(orgId),
    listProjects(orgId),
    listPeople(orgId),
    listSchedulePhases(orgId),
  ]);

  const awaitingScheduling = projects.filter((project) => project.status === "waiting_for_scheduling");
  const jobsToInvoice = projects.filter((project) => ["installation_complete", "qa", "final_costing", "ready_for_invoice"].includes(project.status));
  const waitingUplift = projects.filter((project) => project.status === "quote_sent");
  const quotePending = projects.filter((project) => project.status === "quoting");
  const upcomingCallOuts = callOuts.filter((callOut) => callOut.date >= today).slice(0, 8);
  const customerRevenue = revenueByCustomer(projects);
  const byStatus = PIPELINE_ORDER.map((status) => ({ status, count: projects.filter((project) => project.status === status).length })).filter((stage) => stage.count > 0);

  return <div className="space-y-6"><div><h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Good {greeting()}, {session.user.firstName}</h1><p className="mt-1 text-sm text-muted-foreground">{metrics.activeProjects} active projects · {metrics.onSiteNow} crew on site right now</p></div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><DashboardStat label="Waiting uplift" value={waitingUplift.length} hint="At Uplift Sent" tone={waitingUplift.length ? "warn" : "default"} /><DashboardStat label="Quote pending" value={quotePending.length} hint="At Quoting" tone={quotePending.length ? "warn" : "default"} /><DashboardStat label="Awaiting scheduling" value={awaitingScheduling.length} hint="PO received, not booked" tone={awaitingScheduling.length ? "warn" : "default"} /><DashboardStat label="Jobs to invoice" value={jobsToInvoice.length} hint="Installation Complete or later" tone={jobsToInvoice.length ? "good" : "default"} /></div><Card><CardHeader title="Pipeline" description="Live count by stage" /><div className="flex gap-2 overflow-x-auto px-4 py-3">{byStatus.map(({ status, count }) => <Link key={status} href="/projects" className={`shrink-0 rounded-[var(--radius)] px-3 py-2 tone-${STATUS_META[status].tone} transition-opacity hover:opacity-80`}><p className="text-lg font-semibold tabular-nums">{count}</p><p className="text-[11px] font-medium whitespace-nowrap">{STATUS_META[status].label}</p></Link>)}</div></Card><div className="grid gap-4 xl:grid-cols-[1.05fr_1fr]"><CustomerRevenueCard rows={customerRevenue} currency={session.org.currency} /><Card><CardHeader title="Upcoming Call-Ups" description="The next eight scheduled Call-Ups" action={<Link href="/schedule" className="flex items-center gap-1 text-xs font-medium text-primary">Calendar <ArrowRight className="size-3.5" /></Link>} />{upcomingCallOuts.length ? <ul className="divide-y divide-border-subtle">{upcomingCallOuts.map((callOut) => { const person = people.find((item) => item.id === callOut.userId); return <li key={callOut.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-muted text-primary"><CalendarDays className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{callOut.projectTitle}</p><p className="truncate text-xs text-muted-foreground">{callOut.title} · {person?.name ?? "Unassigned"}</p></div></div><span className="shrink-0 text-xs font-medium text-muted-foreground">{formatDate(callOut.date, true)}</span></li>; })}</ul> : <EmptyState title="No upcoming Call-Ups" description="Add a Call-Up from a project schedule to see it here." />}</Card></div></div>;
}

function DashboardStat({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: "default" | "warn" | "good" }) {
  return <Link href="/projects" className="block"><Stat label={label} value={value} hint={hint} tone={tone} /></Link>;
}

function CustomerRevenueCard({ rows, currency }: { rows: Array<{ name: string; revenueCents: number }>; currency: string }) {
  if (!rows.length) return <Card><CardHeader title="Revenue by customer" description="Live project revenue split" /><EmptyState title="No revenue recorded" description="Project values will appear here as soon as they are captured." /></Card>;
  const total = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const slices = pieSlices(rows, total);
  return <Card><CardHeader title="Revenue by customer" description={`Live split of ${formatMoney(total, currency)} in project revenue`} /><div className="grid gap-5 p-4 sm:grid-cols-[10rem_1fr] sm:items-center"><div className="relative mx-auto size-36"><svg viewBox="0 0 120 120" role="img" aria-label="Revenue split by customer" className="size-full drop-shadow-[0_0_16px_rgb(79_70_229/0.2)]">{slices.map((slice) => <path key={slice.name} d={slice.path} fill={slice.color}><title>{slice.name}: {formatMoney(slice.revenueCents, currency)}</title></path>)}</svg><div className="pointer-events-none absolute inset-[31%] grid place-items-center rounded-full bg-surface text-center ring-1 ring-border-subtle"><span className="text-[10px] font-bold text-muted-foreground">REVENUE</span></div></div><ul className="space-y-2">{rows.map((row, index) => <li key={row.name} className="flex items-center justify-between gap-3 text-sm"><span className="flex min-w-0 items-center gap-2"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: CUSTOMER_COLORS[index % CUSTOMER_COLORS.length] }} /><span className="truncate">{row.name}</span></span><span className="shrink-0 font-semibold tabular-nums">{formatMoney(row.revenueCents, currency, { compact: true })}</span></li>)}</ul></div></Card>;
}

function pieSlices(rows: Array<{ name: string; revenueCents: number }>, total: number) {
  let accumulated = 0;
  return rows.map((row, index) => {
    const start = accumulated / total * Math.PI * 2 - Math.PI / 2;
    accumulated += row.revenueCents;
    const end = accumulated / total * Math.PI * 2 - Math.PI / 2;
    return { ...row, color: CUSTOMER_COLORS[index % CUSTOMER_COLORS.length], path: piePath(start, end) };
  });
}

function piePath(start: number, end: number) {
  if (end - start >= Math.PI * 2 - 0.0001) return "M 60 10 A 50 50 0 1 1 59.99 10 Z";
  const startX = 60 + Math.cos(start) * 50;
  const startY = 60 + Math.sin(start) * 50;
  const endX = 60 + Math.cos(end) * 50;
  const endY = 60 + Math.sin(end) * 50;
  return `M 60 60 L ${startX} ${startY} A 50 50 0 ${end - start > Math.PI ? 1 : 0} 1 ${endX} ${endY} Z`;
}

function revenueByCustomer(projects: Awaited<ReturnType<typeof listProjects>>) {
  const totals = new Map<string, number>();
  for (const project of projects) {
    if (["lost", "cancelled"].includes(project.status) || project.contractValueCents <= 0) continue;
    totals.set(project.customerName, (totals.get(project.customerName) ?? 0) + project.contractValueCents);
  }
  return [...totals.entries()].map(([name, revenueCents]) => ({ name, revenueCents })).sort((left, right) => right.revenueCents - left.revenueCents).slice(0, 8);
}

function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
