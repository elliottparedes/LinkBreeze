import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { getVisitorHash } from "@/lib/visitor";
import { rateLimit } from "@/lib/rate-limit";
import { isBot } from "@/lib/bot-detect";
import { getSession } from "@/lib/auth";
import { getPageById, recordSocialClick } from "@/server/queries";
import { maybeRunScheduledBackup } from "@/server/backup-scheduler";
import { parseTrafficSource } from "@/lib/traffic-source";
import { resolveSocialTarget } from "@/lib/social-redirect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Social-icon tap. Looks the destination up from the page's saved
 * social links (never from the query string) and counts the tap on
 * its own, apart from link clicks.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string; platform: string }> },
) {
  const { pageId: rawPageId, platform } = await params;
  const pageId = Number(rawPageId);
  if (!Number.isInteger(pageId) || pageId <= 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const page = await getPageById(pageId);
  const target = page ? resolveSocialTarget(page.socialLinks, platform) : null;
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const h = await headers();
    const ip =
      (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
      (h.get("x-real-ip") || "").toString() ||
      "0.0.0.0";
    const rl = rateLimit(`icon:${ip}`, 60, 60_000);
    if (rl.ok) {
      const userAgent = (h.get("user-agent") || "").toString();
      const isCrawler = isBot(userAgent);
      const hasSessionCookie = !!h.get("cookie")?.includes("lb_session");
      const isOwner = hasSessionCookie ? await getSession() : null;
      if (process.env.NODE_ENV === "production" && !isCrawler && !isOwner) {
        const source = parseTrafficSource(request.nextUrl.searchParams.get("s"));
        await recordSocialClick(pageId, platform, getVisitorHash(ip, userAgent), source);
        maybeRunScheduledBackup();
      }
    }
  } catch (err) {
    console.error("[/go/icon] failed to record tap", err);
  }

  return NextResponse.redirect(target, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
