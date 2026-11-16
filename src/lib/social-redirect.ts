import {
  isSocialPlatform,
  normalizeSocialUrl,
} from "@/lib/social-icons";

/**
 * Turn a page's saved social-links JSON plus a platform key into the
 * URL a tap should open. The destination always comes from the page
 * row, never from the request, so the redirect cannot be pointed at
 * an arbitrary host.
 */
export function resolveSocialTarget(
  socialLinksJson: string | null | undefined,
  platform: string,
): string | null {
  if (!isSocialPlatform(platform)) return null;
  let items: unknown;
  try {
    items = JSON.parse(socialLinksJson || "[]");
  } catch {
    return null;
  }
  if (!Array.isArray(items)) return null;
  const match = items.find(
    (item): item is { platform: string; url: string } =>
      !!item &&
      typeof item === "object" &&
      (item as { platform?: unknown }).platform === platform &&
      typeof (item as { url?: unknown }).url === "string",
  );
  if (!match) return null;
  const href = normalizeSocialUrl(platform, match.url);
  if (!href) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:" && url.protocol !== "mailto:") {
      return null;
    }
    return href;
  } catch {
    return null;
  }
}
