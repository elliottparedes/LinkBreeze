import { redirect } from "next/navigation";
import {
  getAllThemes,
  getActiveTheme,
  getThemeById,
  seedThemesIfEmpty,
  getAllPages,
  getAllCustomFonts,
  getCapabilitiesForUser,
} from "@/server/queries";
import { getSession } from "@/lib/auth";
import { pickVisiblePage } from "@/lib/ownership";
import type { CustomFontMeta } from "@/lib/custom-fonts";
import { ThemeManager } from "./theme-manager";

export const dynamic = "force-dynamic";

export default async function ThemePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Ensure presets exist, then load.
  await seedThemesIfEmpty();

  const session = await getSession();
  if (!session) redirect("/login");
  const { caps } = await getCapabilitiesForUser(session.userId);

  const { page: pageParam } = await searchParams;
  const allPages = await getAllPages();
  const activePage = pickVisiblePage(
    allPages,
    caps,
    session.userId,
    pageParam ? Number(pageParam) : null,
  );

  const [allThemes, active, fontRows] = await Promise.all([
    getAllThemes(),
    getActiveTheme(),
    getAllCustomFonts(),
  ]);
  const themes = caps.manageInstance
    ? allThemes
    : allThemes.filter((theme) => {
        if (theme.isPreset) return true;
        if (theme.isActive) return false;
        const users = allPages.filter((page) => page.themeId === theme.id);
        return users.length > 0 && users.every((page) => page.userId === session.userId);
      });

  // Uploaded fonts (#82) — serialisable metadata for the client customizer.
  const customFonts: CustomFontMeta[] = fontRows.map((f) => ({
    id: f.id,
    name: f.name,
    family: f.family,
    filename: f.filename,
    url: f.url,
    sizeBytes: f.sizeBytes,
    format: f.format,
  }));

  // The theme the customizer edits: the page's own theme when set, else the
  // globally active theme. This is what the public page renders for this
  // page, so this is what "Customise" and "Duplicate" must target.
  const pageTheme = activePage?.themeId
    ? await getThemeById(activePage.themeId)
    : null;
  const effective = pageTheme ?? active;
  const ownsTheme =
    caps.manageInstance ||
    Boolean(
      pageTheme &&
        !pageTheme.isPreset &&
        !pageTheme.isActive &&
        allPages
          .filter((page) => page.themeId === pageTheme.id)
          .every((page) => page.userId === session.userId),
    );

  return (
    <div className="flex flex-col gap-8">
      <ThemeManager
        themes={themes}
        activeId={active?.id ?? null}
        active={effective}
        pageId={activePage?.id}
        pageThemeId={activePage?.themeId ?? null}
        ownsTheme={ownsTheme}
        customFonts={customFonts}
        pageBgAdjustment={{
          fit: activePage?.backgroundFitOverride ?? null,
          posX: activePage?.backgroundPosX ?? null,
          posY: activePage?.backgroundPosY ?? null,
          zoom: activePage?.backgroundZoom ?? null,
        }}
      />
    </div>
  );
}
