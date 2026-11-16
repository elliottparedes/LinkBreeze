"use server";

import { revalidatePath } from "next/cache";
import { demoGuard } from "@/lib/demo-guard";
import { customSchema } from "@/lib/theme-schema";
import {
  setActiveTheme,
  updateTheme,
  getActiveTheme,
  getThemeById,
  getPagesUsingTheme,
  duplicateTheme,
  deleteTheme,
  getCapabilitiesForUser,
} from "@/server/queries";
import {
  type ActionResult,
  validationError,
  notFoundError,
  conflictError,
  forbiddenError,
  unauthorizedError,
  logError,
} from "@/lib/errors";
import { requireInstanceAdmin } from "@/server/access";
import { getSession } from "@/lib/auth";
import { parseCustomFontId } from "@/lib/custom-fonts";

type ThemeActor =
  | { admin: true; userId: number; username: string }
  | { admin: false; userId: number; username: string };

async function themeActor(): Promise<ThemeActor | null> {
  const session = await getSession();
  if (!session) return null;
  const { caps } = await getCapabilitiesForUser(session.userId);
  return {
    admin: caps.manageInstance,
    userId: session.userId,
    username: session.username,
  };
}

/** A member may edit a theme only when it is their private copy: not a
 *  preset, not the instance default, and every page using it is theirs. */
async function memberOwnsTheme(userId: number, themeId: number): Promise<boolean> {
  const theme = await getThemeById(themeId);
  if (!theme || theme.isPreset || theme.isActive) return false;
  const using = await getPagesUsingTheme(themeId);
  if (using.length === 0) return true;
  return using.every((page) => page.userId === userId);
}

async function uniqueThemeName(base: string): Promise<string> {
  const { themeNameExists } = await import("@/server/queries");
  const root = base.trim().slice(0, 80) || "Theme";
  for (let i = 1; i < 50; i++) {
    const name = (i === 1 ? root : `${root} ${i}`).slice(0, 100);
    if (!(await themeNameExists(name))) return name;
  }
  return `${root} ${Date.now()}`.slice(0, 100);
}

/**
 * Theme id to store on a member's page. Shared presets and the instance
 * default are copied first so a later edit cannot change anyone else's page.
 */
export async function claimThemeForMember(
  themeId: number,
  userId: number,
  username: string,
): Promise<number> {
  const theme = await getThemeById(themeId);
  if (!theme) return themeId;
  if (await memberOwnsTheme(userId, themeId)) return themeId;
  const created = await duplicateTheme(theme.id, await uniqueThemeName(`${theme.name} · ${username}`));
  return created.id;
}

/** Revalidate the public paths of every page rendering this theme. */
async function revalidateThemePages(themeId: number): Promise<void> {
  try {
    const using = await getPagesUsingTheme(themeId);
    for (const page of using) {
      revalidatePath(`/${page.slug}`);
    }
  } catch (err) {
    // Revalidation is best-effort: a failure here must not fail the save.
    logError("revalidateThemePages", err, { themeId });
  }
}

export async function activateTheme(id: number): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  // #124: capability gate — the role ROW decides, not the session hint.
  const denied = await requireInstanceAdmin();
  if (denied) return denied;
  if (typeof id !== "number" || Number.isNaN(id)) {
    return validationError("Invalid theme id");
  }
  try {
    await setActiveTheme(id);
    revalidatePath("/theme");
    revalidatePath("/");
    await revalidateThemePages(id);
    return { success: true };
  } catch (err) {
    logError("activateTheme", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: "internal",
    };
  }
}

export async function customizeActiveTheme(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const actor = await themeActor();
  if (!actor) return unauthorizedError();

  // Theme to edit: explicit id (page-specific theme or customizer target),
  // falling back to the globally active theme. Editing the global theme when
  // the caller meant a page's own theme was Bug 1 — the public page renders
  // page.themeId first, so the edit silently had no visible effect.
  const themeIdRaw = formData.get("themeId");
  const themeId = themeIdRaw ? Number(themeIdRaw) : null;
  const target = themeId && Number.isFinite(themeId)
    ? await getThemeById(themeId)
    : await getActiveTheme();
  if (!target) return notFoundError("No theme to customise");
  if (!actor.admin && !(await memberOwnsTheme(actor.userId, target.id))) {
    return forbiddenError("This theme is shared. Save a copy to customise your own page.");
  }

  const parsed = customSchema.safeParse({
    backgroundType: formData.get("backgroundType") || undefined,
    backgroundValue: formData.get("backgroundValue") || undefined,
    backgroundAngle: formData.get("backgroundAngle") || undefined,
    backgroundImageUrl: formData.get("backgroundImageUrl") || undefined,
    backgroundFit: formData.get("backgroundFit") || undefined,
    backgroundPosition: formData.get("backgroundPosition") || undefined,
    overlayColor: formData.get("overlayColor") || undefined,
    overlayOpacity: formData.get("overlayOpacity") || undefined,
    primaryColor: formData.get("primaryColor") || undefined,
    secondaryColor: formData.get("secondaryColor") || undefined,
    cardBackground: formData.get("cardBackground") || undefined,
    cardBorderColor: formData.get("cardBorderColor") || undefined,
    textColor: formData.get("textColor") || undefined,
    mutedTextColor: formData.get("mutedTextColor") || undefined,
    fontFamily: formData.get("fontFamily") || undefined,
    cardFontFamily: formData.get("cardFontFamily") ?? undefined,
    fontScale: formData.get("fontScale") || undefined,
    fontWeight: formData.get("fontWeight") || undefined,
    letterSpacing: formData.get("letterSpacing") || undefined,
    linkStyle: formData.get("linkStyle") || undefined,
    animationType: formData.get("animationType") || undefined,
    radius: formData.get("radius") || undefined,
    buttonSize: formData.get("buttonSize") || undefined,
    borderWidth: formData.get("borderWidth") || undefined,
    shadowStrength: formData.get("shadowStrength") || undefined,
    hoverEffect: formData.get("hoverEffect") || undefined,
    containerWidth: formData.get("containerWidth") || undefined,
    alignment: formData.get("alignment") || undefined,
    density: formData.get("density") || undefined,
    glow: formData.get("glow") || undefined,
    glowColor: formData.get("glowColor") || undefined,
    blur: formData.get("blur") || undefined,
    noise: formData.get("noise") || undefined,
    avatarShape: formData.get("avatarShape") || undefined,
    avatarBorder: formData.get("avatarBorder") || undefined,
    avatarFloat: formData.get("avatarFloat") || undefined,
    avatarSize: formData.get("avatarSize") || undefined,
    dividerStyle: formData.get("dividerStyle") || undefined,
    dividerColor: formData.has("dividerColor") ? formData.get("dividerColor") : undefined,
    dividerThickness: formData.get("dividerThickness") || undefined,
    dividerWidth: formData.get("dividerWidth") || undefined,
    profileLayout: formData.get("profileLayout") || undefined,
    textAnimation: formData.get("textAnimation") || undefined,
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const active = target;
  if (!active) return notFoundError("No active theme");

  const updates: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) updates[key] = value as string;
  }

  // Uploaded-font references must point at a real custom_fonts row, so a
  // deleted font can't be re-selected from a stale client state. Applies
  // to both the site font and the card font.
  for (const key of ["fontFamily", "cardFontFamily"] as const) {
    const val = updates[key];
    if (val && parseCustomFontId(val)) {
      const fontId = parseCustomFontId(val)!;
      const { getCustomFontById } = await import("@/server/queries");
      if (!(await getCustomFontById(fontId))) {
        return validationError("That custom font no longer exists");
      }
    }
  }

  if (Object.keys(updates).length > 0) {
    try {
      await updateTheme(active.id, updates);
    } catch (err) {
      logError("customizeActiveTheme", err, { themeId: active.id });
      return {
        success: false,
        error: "Something went wrong. Please try again.",
        errorCode: "internal",
      };
    }
  }

  revalidatePath("/theme");
  revalidatePath("/");
  // Revalidate every public page rendering this theme so edits appear
  // immediately instead of waiting out the ISR window.
  await revalidateThemePages(active.id);
  return { success: true };
}

export async function duplicateActiveTheme(
  name: string,
  themeId?: number,
): Promise<ActionResult<{ themeId: number }>> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const actor = await themeActor();
  if (!actor) return unauthorizedError();

  // Bug 2 fix: duplicate the theme shown in the customizer (page theme or
  // explicit id), not always the globally active one.
  const source = themeId && Number.isFinite(themeId)
    ? await getThemeById(themeId)
    : await getActiveTheme();
  if (!source) return notFoundError("No theme to duplicate");
  if (!actor.admin && !source.isPreset && !source.isActive && !(await memberOwnsTheme(actor.userId, source.id))) {
    return forbiddenError("You can only copy a preset or your own theme.");
  }

  const trimmed = (name || "").trim().slice(0, 100);
  if (!trimmed) return validationError("Name is required");

  const { themeNameExists } = await import("@/server/queries");
  if (await themeNameExists(trimmed)) {
    return conflictError("A theme with this name already exists");
  }

  try {
    const created = await duplicateTheme(source.id, trimmed);
    revalidatePath("/theme");
    return { success: true, themeId: created.id };
  } catch (err) {
    logError("duplicateActiveTheme", err, { themeId: source.id, name: trimmed });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: "internal",
    };
  }
}

export async function deleteCustomTheme(id: number): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const actor = await themeActor();
  if (!actor) return unauthorizedError();
  if (!actor.admin) {
    const theme = await getThemeById(id);
    const using = theme ? await getPagesUsingTheme(id) : [];
    const exclusive =
      Boolean(theme) &&
      !theme!.isPreset &&
      !theme!.isActive &&
      using.length > 0 &&
      using.every((page) => page.userId === actor.userId);
    if (!exclusive) {
      return forbiddenError("You can only delete a theme used by your own page.");
    }
  }
  if (typeof id !== "number" || Number.isNaN(id)) {
    return validationError("Invalid theme id");
  }

  // Don't allow deleting presets or the active theme
  const active = await getActiveTheme();
  if (active?.id === id) {
    return validationError("Cannot delete the active theme");
  }
  const row = await getThemeById(id);
  if (!row) return validationError("Theme not found");
  if (row.isPreset) {
    return validationError("Built-in themes cannot be deleted");
  }

  try {
    await deleteTheme(id);
    revalidatePath("/theme");
    return { success: true };
  } catch (err) {
    logError("deleteCustomTheme", err, { id });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: "internal",
    };
  }
}
