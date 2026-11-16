/**
 * Campaign source tags (`?s=ig`).
 *
 * Instagram, TikTok, and YouTube open a bio link inside their own browser
 * and send no Referer, so the referrer chart cannot tell them apart.
 * A short tag on the URL is stored with the page view and the click.
 * Only the known tags are kept — anything else is dropped, so a query
 * string cannot write arbitrary text into analytics.
 */

export const CAMPAIGN_SOURCES = [
  { id: "ig" },
  { id: "tiktok" },
  { id: "yt" },
  { id: "x" },
  { id: "newsletter" },
  { id: "qr" },
] as const;

export type CampaignSource = (typeof CAMPAIGN_SOURCES)[number]["id"];

const ALLOWED = new Set<string>(CAMPAIGN_SOURCES.map((s) => s.id));

export function parseTrafficSource(raw: string | null | undefined): CampaignSource | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  return ALLOWED.has(value) ? (value as CampaignSource) : null;
}

/** Append `?s=` / `&s=` when a tag is present. The tag is a known token. */
export function appendSource(href: string, source: string | null | undefined): string {
  if (!source) return href;
  const join = href.includes("?") ? "&" : "?";
  return `${href}${join}s=${source}`;
}

/** Public page URL, optionally tagged. Origin has no trailing slash. */
export function pageShareUrl(origin: string, slug: string, source?: string | null): string {
  const base = `${origin.replace(/\/$/, "")}/${slug}`;
  return appendSource(base, source ?? null);
}
