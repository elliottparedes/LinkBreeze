import { describe, it, expect } from "vitest";
import "./integration-setup";
import { db, seedPage, seedLink } from "./integration-setup";
import { recordClick, recordPageview, recordSocialClick, getDashboardStats } from "@/server/queries";
import {
  getLinkRates,
  getRecentActivity,
  getSocialTaps,
  getTrafficSources,
  getViewHeatmap,
} from "@/server/insights";
import { analyticsClicks, analyticsPageviews } from "@/db/schema";
import { eq } from "drizzle-orm";

function utcStamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

describe("[integration] campaign analytics", () => {
  it("groups page views by the ?s= tag and keeps untagged visits separate", async () => {
    const page = seedPage({ slug: "sources", title: "Sources" });
    await recordPageview("a", null, "mobile", null, page.id, "ig");
    await recordPageview("b", null, "mobile", null, page.id, "ig");
    await recordPageview("c", null, "desktop", null, page.id, null);

    const sources = await getTrafficSources("7d", page.id);
    expect(sources.counts.ig).toBe(2);
    expect(sources.counts.tiktok).toBe(0);
    expect(sources.untagged).toBe(1);
  });

  it("stores the campaign tag on a click without counting a social tap as one", async () => {
    const page = seedPage({ slug: "clicks", title: "Clicks" });
    const link = seedLink({ pageId: page.id, title: "Shop", url: "https://shop.example", orderIndex: 0 });
    await recordClick(link.id, "visitor", null, "click", null, "yt");
    await recordSocialClick(page.id, "instagram", "visitor", "ig");

    const stored = db.select().from(analyticsClicks).where(eq(analyticsClicks.linkId, link.id)).all();
    expect(stored).toHaveLength(1);
    expect(stored[0].source).toBe("yt");

    const stats = await getDashboardStats("7d", page.id);
    expect(stats.totalClicks).toBe(1);

    const taps = await getSocialTaps("7d", page.id);
    expect(taps).toEqual([{ platform: "instagram", count: 1 }]);
  });

  it("nudges when a lower link converts better than the one at the top of the page", async () => {
    const page = seedPage({ slug: "rates", title: "Rates" });
    const top = seedLink({ pageId: page.id, title: "About", url: "https://about.example", orderIndex: 0 });
    const lower = seedLink({ pageId: page.id, title: "Shop", url: "https://shop.example", orderIndex: 1 });
    seedLink({ pageId: page.id, title: "Spacer", url: "", type: "divider", orderIndex: 2 });

    for (let i = 0; i < 10; i++) await recordPageview(`v-${i}`, null, "desktop", null, page.id, null);
    await recordClick(top.id, "once", null);
    for (let i = 0; i < 5; i++) await recordClick(lower.id, `shop-${i}`, null);

    const rates = await getLinkRates("7d", page.id);
    expect(rates.links.map((link) => link.title)).toEqual(["Shop", "About"]);
    expect(rates.links[0].ctr).toBe(50);
    expect(rates.links[1].ctr).toBe(10);
    expect(rates.nudge).toEqual({ title: "Shop", ctr: 50, above: "About", aboveCtr: 10 });
  });

  it("buckets views onto the UTC weekday and hour they happened", async () => {
    const page = seedPage({ slug: "heat", title: "Heat" });
    const at = new Date();
    at.setUTCMinutes(15, 0, 0);
    db.insert(analyticsPageviews)
      .values({
        pageId: page.id,
        visitorHash: "heat",
        deviceType: "desktop",
        source: "x",
        createdAt: utcStamp(at),
      })
      .run();

    const cells = await getViewHeatmap("7d", page.id);
    const match = cells.find((cell) => cell.dow === at.getUTCDay() && cell.hour === at.getUTCHours());
    expect(match?.count).toBe(1);
  });

  it("lists the newest view, click, and social tap first", async () => {
    const page = seedPage({ slug: "activity", title: "Activity" });
    const link = seedLink({ pageId: page.id, title: "Shop", url: "https://shop.example" });
    const older = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const newer = new Date(Date.now() - 60 * 1000);

    db.insert(analyticsPageviews)
      .values({
        pageId: page.id,
        visitorHash: "view",
        deviceType: "mobile",
        source: "ig",
        createdAt: utcStamp(older),
      })
      .run();
    db.insert(analyticsClicks)
      .values({
        linkId: link.id,
        visitorHash: "click",
        eventType: "click",
        source: "ig",
        createdAt: utcStamp(newer),
      })
      .run();
    await recordSocialClick(page.id, "youtube", "tap", "yt");

    const activity = await getRecentActivity("7d", page.id);
    expect(activity[0].kind).not.toBe("view");
    const kinds = activity.map((row) => row.kind);
    expect(kinds).toContain("view");
    expect(kinds).toContain("click");
    expect(kinds).toContain("social");
    const view = activity.find((row) => row.kind === "view");
    expect(view).toMatchObject({ source: "ig", device: "mobile" });
    const click = activity.find((row) => row.kind === "click");
    expect(click).toMatchObject({ title: "Shop", source: "ig" });
  });
});
