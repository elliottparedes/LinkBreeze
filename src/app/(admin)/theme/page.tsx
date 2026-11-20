import { redirect } from "next/navigation";
import {
  getAllThemes,
  getActiveTheme,
  getThemeById,
  getThemeLibrary,
  seedThemesIfEmpty,
  getAllPages,
  getAllCustomFonts,
  getCapabilitiesForUser,
} from "@/server/queries";
import { getSession } from "@/lib/auth";
import { canEditPage, pickVisiblePage } from "@/lib/ownership";
import type { CustomFontMeta } from "@/lib/custom-fonts";
import { canEditThemeInPlace } from "@/lib/theme-editing";
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

  const [themes, active, pageTheme, fontRows] = await Promise.all([
    caps.manageInstance ? getAllThemes() : getThemeLibrary(session.userId),
    getActiveTheme(),
    activePage?.themeId ? getThemeById(activePage.themeId) : null,
    getAllCustomFonts(),
  ]);

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

  const effective = pageTheme ?? active;
  const otherThemeIds = new Set(allPages
    .filter((page) => page.id !== activePage?.id)
    .map((page) => page.themeId));
  const editableThemeIds = (effective ? [...themes, effective] : themes)
    .filter((theme) => canEditThemeInPlace(theme, {
      ownerId: activePage?.userId ?? session.userId,
      pageId: activePage?.id,
      manageInstance: caps.manageInstance,
      usedByOtherPage: otherThemeIds.has(theme.id),
    }))
    .map((theme) => theme.id);

  return (
    <div className="flex flex-col gap-8">
      <ThemeManager
        key={`${session.userId}:${activePage?.id ?? "default"}`}
        userId={session.userId}
        themes={themes}
        active={effective}
        pageId={activePage?.id}
        canApply={activePage ? canEditPage(caps, session, activePage) : caps.manageInstance}
        manageInstance={caps.manageInstance}
        editableThemeIds={editableThemeIds}
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
