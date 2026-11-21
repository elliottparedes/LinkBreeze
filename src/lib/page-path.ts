import { decodeSlugParam, RESERVED_SLUGS } from "./link-slug";

export type PageRouteParams = { slug: string; pageSlug?: string };

const PAGE_RESOURCES = ["privacy", "opengraph-image"];

export function isReservedSubpageSlug(slug: string): boolean {
  return PAGE_RESOURCES.includes(slug);
}

export function isReservedPageNamespace(slug: string): boolean {
  return slug === "go" || slug.startsWith("favicon") ||
    RESERVED_SLUGS.some((reserved) => reserved === slug);
}

/** Public page paths are stored without a leading slash. */
export function splitPageSlug(slug: string) {
  const slash = slug.indexOf("/");
  return slash === -1
    ? { namespace: null, segment: slug }
    : { namespace: slug.slice(0, slash), segment: slug.slice(slash + 1) };
}

export function replacePageSlug(path: string, segment: string): string {
  const { namespace } = splitPageSlug(path);
  return namespace ? `${namespace}/${segment}` : segment;
}

/** A percent-encoded slash is not a page segment. */
export function pageSlugFromParams({ slug, pageSlug }: PageRouteParams): string {
  const segments = (pageSlug === undefined ? [slug] : [slug, pageSlug]).map(decodeSlugParam);
  if (segments.some((segment) => !segment || /[/\\]/.test(segment))) return "";
  return segments.join("/");
}

export class PageSlugConflict extends Error {
  constructor() {
    super("A page with this slug already exists");
  }
}
