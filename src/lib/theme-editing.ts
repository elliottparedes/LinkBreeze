import type { ThemeRow } from "@/server/queries";

type ThemeBackground = Pick<ThemeRow, "backgroundType" | "backgroundImageUrl">;

export function sameBackgroundMedia(first: ThemeBackground, second: ThemeBackground): boolean {
  return first.backgroundType === second.backgroundType && first.backgroundImageUrl === second.backgroundImageUrl;
}

export function canEditThemeInPlace(
  theme: ThemeRow,
  scope: { ownerId: number; pageId?: number; manageInstance: boolean; usedByOtherPage: boolean },
): boolean {
  return !theme.isPreset &&
    !(scope.pageId !== undefined && theme.isActive) &&
    !scope.usedByOtherPage &&
    (theme.ownerId === scope.ownerId || (scope.manageInstance && theme.ownerId === null));
}
