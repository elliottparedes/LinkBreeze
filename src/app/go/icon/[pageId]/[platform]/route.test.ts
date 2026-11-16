import { describe, it, expect, vi, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getPageById: vi.fn(),
  recordSocialClick: vi.fn(async () => {}),
  getSession: vi.fn(async () => null),
}));

vi.mock("@/server/queries", () => ({
  getPageById: mocks.getPageById,
  recordSocialClick: mocks.recordSocialClick,
}));
vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(() => ({ ok: true, remaining: 59, resetAt: Date.now() + 60_000 })),
}));
vi.mock("@/lib/bot-detect", () => ({ isBot: vi.fn(() => false) }));
vi.mock("@/server/backup-scheduler", () => ({ maybeRunScheduledBackup: vi.fn() }));
vi.mock("@/lib/visitor", () => ({ getVisitorHash: vi.fn(() => "hash") }));

import { GET } from "@/app/go/icon/[pageId]/[platform]/route";
import { NextRequest } from "next/server";

const saved = JSON.stringify([{ platform: "instagram", url: "https://instagram.com/elliott" }]);

function call(url: string, pageId = "1", platform = "instagram") {
  return GET(new NextRequest(url), { params: Promise.resolve({ pageId, platform }) });
}

describe("GET /go/icon/[pageId]/[platform]", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.recordSocialClick.mockClear();
  });

  it("redirects to the saved profile and records the tap with its campaign tag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    mocks.getPageById.mockResolvedValue({ id: 1, socialLinks: saved });
    const res = await call("http://localhost:3000/go/icon/1/instagram?s=ig");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://instagram.com/elliott");
    expect(mocks.recordSocialClick).toHaveBeenCalledWith(1, "instagram", "hash", "ig");
  });

  it("still redirects in development, without writing a tap", async () => {
    vi.stubEnv("NODE_ENV", "development");
    mocks.getPageById.mockResolvedValue({ id: 1, socialLinks: saved });
    const res = await call("http://localhost:3000/go/icon/1/instagram");
    expect(res.status).toBe(302);
    expect(mocks.recordSocialClick).not.toHaveBeenCalled();
  });

  it("404s a platform the page does not have", async () => {
    mocks.getPageById.mockResolvedValue({ id: 1, socialLinks: saved });
    const res = await call("http://localhost:3000/go/icon/1/tiktok", "1", "tiktok");
    expect(res.status).toBe(404);
    expect(mocks.recordSocialClick).not.toHaveBeenCalled();
  });
});
