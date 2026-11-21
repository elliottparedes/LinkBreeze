import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Validates the PWA web manifest. Issue #18 required a manifest that lets
 * public pages be installed ("Add to Home Screen") on mobile. This test
 * guards the required fields a browser checks before showing the install
 * prompt — losing any of them silently breaks installation.
 */
describe("PWA manifest (public/site.webmanifest)", () => {
  const manifestPath = join(process.cwd(), "public", "site.webmanifest");
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf-8"),
  ) as Record<string, unknown>;

  it("has name and short_name (<=12 chars for launcher)", () => {
    expect(manifest.name).toBe("LinkQuilt");
    expect(typeof manifest.short_name).toBe("string");
    expect((manifest.short_name as string).length).toBeLessThanOrEqual(12);
  });

  it("declares standalone display for app-like UX", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("has start_url and scope rooted at the app", () => {
    expect(typeof manifest.start_url).toBe("string");
    expect((manifest.start_url as string).startsWith("/")).toBe(true);
    expect(manifest.scope).toBe("/");
  });

  it("declares theme_color and background_color", () => {
    expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("provides at least a 192px and a 512px icon (install prompt minimum)", () => {
    const icons = (manifest.icons as Array<{ sizes: string }>) ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("includes a maskable icon (Android adaptive icon)", () => {
    const icons = (manifest.icons as Array<{ purpose?: string }>) ?? [];
    const hasMaskable = icons.some((i) => i.purpose === "maskable");
    expect(hasMaskable).toBe(true);
  });
});
