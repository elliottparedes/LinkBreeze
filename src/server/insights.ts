import "server-only";
import { db } from "@/db";
import {
  analyticsClicks,
  analyticsPageviews,
  analyticsSocialClicks,
  links,
} from "@/db/schema";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { sinceExpr, type AnalyticsRange } from "@/lib/analytics-range";
import { CAMPAIGN_SOURCES, type CampaignSource } from "@/lib/traffic-source";
import { getAllLinks } from "@/server/queries";

const NON_CLICKABLE = new Set(["divider", "embed", "text"]);

export interface TrafficSourceCounts {
  counts: Record<CampaignSource, number>;
  untagged: number;
}

export interface LinkRate {
  id: number;
  title: string;
  clicks: number;
  ctr: number;
}

export interface LinkRates {
  links: LinkRate[];
  /** Set when a link lower on the page converts better than the top one. */
  nudge: { title: string; ctr: number; above: string; aboveCtr: number } | null;
}

export interface HeatCell {
  dow: number;
  hour: number;
  count: number;
}

export interface ActivityRow {
  kind: "view" | "click" | "social";
  /** Link title, or the social platform id. Empty for a page view. */
  title: string;
  source: string | null;
  device: string | null;
  createdAt: string;
}

export interface SocialTap {
  platform: string;
  count: number;
}

function pageviewWhere(range: AnalyticsRange, pageId?: number) {
  const since = sinceExpr(range);
  return pageId !== undefined
    ? and(gt(analyticsPageviews.createdAt, since), eq(analyticsPageviews.pageId, pageId))
    : gt(analyticsPageviews.createdAt, since);
}

export async function getTrafficSources(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<TrafficSourceCounts> {
  const counts = Object.fromEntries(CAMPAIGN_SOURCES.map((s) => [s.id, 0])) as Record<
    CampaignSource,
    number
  >;
  const rows = await db
    .select({
      source: analyticsPageviews.source,
      count: sql<number>`count(*)`,
    })
    .from(analyticsPageviews)
    .where(pageviewWhere(range, pageId))
    .groupBy(analyticsPageviews.source);

  let untagged = 0;
  for (const row of rows) {
    const count = Number(row.count);
    if (row.source && row.source in counts) {
      counts[row.source as CampaignSource] += count;
    } else {
      untagged += count;
    }
  }
  return { counts, untagged };
}

export async function getLinkRates(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<LinkRates> {
  if (pageId === undefined) return { links: [], nudge: null };
  const since = sinceExpr(range);
  const pageLinks = (await getAllLinks(pageId)).filter((link) => !NON_CLICKABLE.has(link.type));

  const countRows = await db
    .select({
      id: analyticsClicks.linkId,
      clicks: sql<number>`count(*)`,
    })
    .from(analyticsClicks)
    .innerJoin(links, eq(links.id, analyticsClicks.linkId))
    .where(
      and(
        gt(analyticsClicks.createdAt, since),
        eq(analyticsClicks.eventType, "click"),
        eq(links.pageId, pageId),
      ),
    )
    .groupBy(analyticsClicks.linkId);

  const viewRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(analyticsPageviews)
    .where(and(gt(analyticsPageviews.createdAt, since), eq(analyticsPageviews.pageId, pageId)));
  const views = Number(viewRows[0]?.c ?? 0);
  const byId = new Map(countRows.map((row) => [row.id, Number(row.clicks)]));

  const ordered = pageLinks.map((link) => {
    const clicks = byId.get(link.id) ?? 0;
    const ctr = views > 0 ? Math.round((clicks / views) * 100) : 0;
    return { id: link.id, title: link.title, clicks, ctr };
  });

  const top = ordered[0];
  const best = ordered.reduce<LinkRate | undefined>(
    (winner, row) => (!winner || row.ctr > winner.ctr ? row : winner),
    top,
  );
  const nudge =
    top && best && best.id !== top.id && best.ctr > top.ctr
      ? { title: best.title, ctr: best.ctr, above: top.title, aboveCtr: top.ctr }
      : null;

  const ranked = ordered
    .filter((link) => link.clicks > 0)
    .sort((a, b) => b.clicks - a.clicks || a.id - b.id)
    .slice(0, 8);

  return { links: ranked, nudge };
}

export async function getViewHeatmap(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<HeatCell[]> {
  const rows = await db
    .select({
      dow: sql<number>`cast(strftime('%w', ${analyticsPageviews.createdAt}) as integer)`,
      hour: sql<number>`cast(strftime('%H', ${analyticsPageviews.createdAt}) as integer)`,
      count: sql<number>`count(*)`,
    })
    .from(analyticsPageviews)
    .where(pageviewWhere(range, pageId))
    .groupBy(
      sql`strftime('%w', ${analyticsPageviews.createdAt})`,
      sql`strftime('%H', ${analyticsPageviews.createdAt})`,
    );

  return rows.map((row) => ({
    dow: Number(row.dow),
    hour: Number(row.hour),
    count: Number(row.count),
  }));
}

function stamp(value: string): number {
  const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export async function getRecentActivity(
  range: AnalyticsRange = "7d",
  pageId?: number,
  limit = 8,
): Promise<ActivityRow[]> {
  const since = sinceExpr(range);
  const viewWhere = pageviewWhere(range, pageId);
  const clickWhere =
    pageId !== undefined
      ? and(
          gt(analyticsClicks.createdAt, since),
          eq(analyticsClicks.eventType, "click"),
          sql`${analyticsClicks.linkId} IN (SELECT ${links.id} FROM ${links} WHERE ${links.pageId} = ${pageId})`,
        )
      : and(gt(analyticsClicks.createdAt, since), eq(analyticsClicks.eventType, "click"));
  const socialWhere =
    pageId !== undefined
      ? and(gt(analyticsSocialClicks.createdAt, since), eq(analyticsSocialClicks.pageId, pageId))
      : gt(analyticsSocialClicks.createdAt, since);

  const [views, clicks, socials] = await Promise.all([
    db
      .select({
        source: analyticsPageviews.source,
        device: analyticsPageviews.deviceType,
        createdAt: analyticsPageviews.createdAt,
      })
      .from(analyticsPageviews)
      .where(viewWhere)
      .orderBy(desc(analyticsPageviews.createdAt))
      .limit(limit),
    db
      .select({
        title: links.title,
        source: analyticsClicks.source,
        createdAt: analyticsClicks.createdAt,
      })
      .from(analyticsClicks)
      .innerJoin(links, eq(links.id, analyticsClicks.linkId))
      .where(clickWhere)
      .orderBy(desc(analyticsClicks.createdAt))
      .limit(limit),
    db
      .select({
        platform: analyticsSocialClicks.platform,
        source: analyticsSocialClicks.source,
        createdAt: analyticsSocialClicks.createdAt,
      })
      .from(analyticsSocialClicks)
      .where(socialWhere)
      .orderBy(desc(analyticsSocialClicks.createdAt))
      .limit(limit),
  ]);

  const merged: ActivityRow[] = [
    ...views.map((row) => ({
      kind: "view" as const,
      title: "",
      source: row.source,
      device: row.device,
      createdAt: row.createdAt,
    })),
    ...clicks.map((row) => ({
      kind: "click" as const,
      title: row.title,
      source: row.source,
      device: null,
      createdAt: row.createdAt,
    })),
    ...socials.map((row) => ({
      kind: "social" as const,
      title: row.platform,
      source: row.source,
      device: null,
      createdAt: row.createdAt,
    })),
  ];

  merged.sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
  return merged.slice(0, limit);
}

export async function getSocialTaps(
  range: AnalyticsRange = "7d",
  pageId?: number,
): Promise<SocialTap[]> {
  const since = sinceExpr(range);
  const where =
    pageId !== undefined
      ? and(gt(analyticsSocialClicks.createdAt, since), eq(analyticsSocialClicks.pageId, pageId))
      : gt(analyticsSocialClicks.createdAt, since);
  const rows = await db
    .select({
      platform: analyticsSocialClicks.platform,
      count: sql<number>`count(*)`,
    })
    .from(analyticsSocialClicks)
    .where(where)
    .groupBy(analyticsSocialClicks.platform)
    .orderBy(desc(sql`count(*)`))
    .limit(8);
  return rows.map((row) => ({ platform: row.platform, count: Number(row.count) }));
}
