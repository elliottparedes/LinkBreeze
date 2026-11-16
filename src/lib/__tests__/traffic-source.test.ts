import { describe, it, expect } from "vitest";
import { appendSource, pageShareUrl, parseTrafficSource } from "@/lib/traffic-source";
import { resolveSocialTarget } from "@/lib/social-redirect";
import { buildLinkCardHtml } from "@/components/public/build-link-card";
import type { LinkRow } from "@/server/queries";

describe("parseTrafficSource", () => {
  it("keeps the known campaign tags and normalizes case", () => {
    expect(parseTrafficSource("IG")).toBe("ig");
    expect(parseTrafficSource(" tiktok ")).toBe("tiktok");
    expect(parseTrafficSource("qr")).toBe("qr");
  });

  it("drops anything that is not a known tag", () => {
    expect(parseTrafficSource("https://evil.test")).toBeNull();
    expect(parseTrafficSource("<script>")).toBeNull();
    expect(parseTrafficSource("")).toBeNull();
    expect(parseTrafficSource(null)).toBeNull();
  });
});

describe("appendSource / pageShareUrl", () => {
  it("tags a page URL and leaves an untagged URL alone", () => {
    expect(pageShareUrl("https://linkbreeze.test", "elliott", "qr")).toBe(
      "https://linkbreeze.test/elliott?s=qr",
    );
    expect(pageShareUrl("https://linkbreeze.test/", "elliott", null)).toBe(
      "https://linkbreeze.test/elliott",
    );
  });

  it("uses & when the href already has a query", () => {
    expect(appendSource("/go/shop?link=1", "ig")).toBe("/go/shop?link=1&s=ig");
  });
});

describe("resolveSocialTarget", () => {
  const saved = JSON.stringify([
    { platform: "instagram", url: "https://instagram.com/elliott" },
    { platform: "email", url: "hi@example.com" },
  ]);

  it("resolves a saved platform and mailto", () => {
    expect(resolveSocialTarget(saved, "instagram")).toBe("https://instagram.com/elliott");
    expect(resolveSocialTarget(saved, "email")).toBe("mailto:hi@example.com");
  });

  it("refuses a platform the page does not have, and a non-http destination", () => {
    expect(resolveSocialTarget(saved, "tiktok")).toBeNull();
    expect(resolveSocialTarget(saved, "../admin")).toBeNull();
    expect(
      resolveSocialTarget(JSON.stringify([{ platform: "website", url: "javascript:alert(1)" }]), "website"),
    ).toBeNull();
  });
});

describe("public hrefs carry the campaign tag", () => {
  const link = {
    id: 2,
    type: "url",
    title: "Site",
    url: "https://example.com",
    description: null,
    redirectSlug: null,
    isHighlighted: false,
    iconMode: "auto",
  } as LinkRow;

  it("points an http link at /go with ?s=", () => {
    const html = buildLinkCardHtml({ link, theme: {}, index: 0, source: "ig" });
    expect(html).toContain('href="/go/2?s=ig"');
  });

  it("leaves the href untagged when there is no source", () => {
    const html = buildLinkCardHtml({ link, theme: {}, index: 0 });
    expect(html).toContain('href="/go/2"');
    expect(html).not.toContain("?s=");
  });
});
