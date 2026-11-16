import { redirect } from "next/navigation";
import {
  getAllLinks,
  getAllPages,
  getSectionsByPage,
  getThemeById,
  getActiveTheme,
  getCapabilitiesForUser,
} from "@/server/queries";
import { getSession } from "@/lib/auth";
import { pickVisiblePage } from "@/lib/ownership";
import { LinksManager } from "./links-manager";

export const dynamic = "force-dynamic";

export default async function LinksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const session = await getSession();
  if (!session) redirect("/login");
  const { caps } = await getCapabilitiesForUser(session.userId);
  const allPages = await getAllPages();
  const activePage = pickVisiblePage(
    allPages,
    caps,
    session.userId,
    pageParam ? Number(pageParam) : null,
  );
  if (!activePage) redirect("/dashboard");

  // The add/edit link sheet renders a live card preview with the page's REAL
  // theme — same resolution order as the public page: page themeId → global
  // active theme.
  const [links, sections, pageTheme] = await Promise.all([
    getAllLinks(activePage.id),
    getSectionsByPage(activePage.id),
    activePage.themeId ? getThemeById(activePage.themeId) : getActiveTheme(),
  ]);
  return (
    <LinksManager
      initialLinks={links}
      sections={sections}
      pageId={activePage.id}
      pageTheme={pageTheme}
      pageSlug={activePage.slug}
    />
  );
}
