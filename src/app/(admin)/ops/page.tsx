import { Activity } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import { getSession } from "@/lib/auth";
import { getCapabilitiesForUser } from "@/server/queries";
import { formatBytes, formatUptime, getOpsSnapshot } from "@/server/ops";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { caps } = await getCapabilitiesForUser(session.userId);
  if (!caps.manageInstance) redirect("/dashboard");

  const t = await getTranslations("ops");
  const snap = getOpsSnapshot();

  const processRows = [
    [t("version"), snap.version],
    [t("uptime"), formatUptime(snap.uptimeSeconds)],
    [t("memoryUsed"), formatBytes(snap.memory.rss)],
    [t("heapUsed"), formatBytes(snap.memory.heapUsed)],
    [t("memoryFree"), formatBytes(snap.memory.free)],
    [t("memoryTotal"), formatBytes(snap.memory.total)],
    [t("dbSize"), formatBytes(snap.databaseBytes)],
  ] as const;

  const peopleRows = [
    [t("accounts"), String(snap.accounts.total)],
    [t("active"), String(snap.accounts.active)],
    [t("disabled"), String(snap.accounts.disabled)],
    [t("signupsDay"), String(snap.signups.day)],
    [t("signupsWeek"), String(snap.signups.week)],
    [t("signupsMonth"), String(snap.signups.month)],
    [t("pages"), String(snap.pages)],
    [t("links"), String(snap.links)],
  ] as const;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-24 pt-6 md:pb-8">
      <div className="flex items-center gap-2">
        <Activity className="size-5 shrink-0" aria-hidden />
        <div>
          <h1 className="text-lg font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("description")}</p>
        </div>
      </div>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium">{t("sectionProcess")}</h2>
        <dl className="divide-y divide-border">
          {processRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium">{t("sectionPeople")}</h2>
        <dl className="divide-y divide-border">
          {peopleRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-medium">{t("recentSignups")}</h2>
        {snap.recentSignups.length === 0 ? (
          <p className="px-4 py-3 text-sm text-muted-foreground">{t("noSignups")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {snap.recentSignups.map((account) => (
              <li key={account.username} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
                <span className="font-medium">{account.username}</span>
                <span className="text-muted-foreground">{account.createdAt}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
