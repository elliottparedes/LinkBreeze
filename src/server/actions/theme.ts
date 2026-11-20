"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { customFonts, pages, themes } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { parseCustomFontId } from "@/lib/custom-fonts";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionError,
  type ActionResult,
  conflictError,
  forbiddenError,
  logError,
  notFoundError,
  unauthorizedError,
  validationError,
  withAction,
} from "@/lib/errors";
import { canEditPage } from "@/lib/ownership";
import { canEditThemeInPlace, sameBackgroundMedia } from "@/lib/theme-editing";
import {
  backgroundAdjustmentSchema,
  customSchema,
  sanitizeThemeFields,
} from "@/lib/theme-schema";
import {
  getCapabilitiesForUser,
  insertThemeCopy,
  markActiveTheme,
  removeTheme,
  themeNameExists,
} from "@/server/queries";

const applySchema = z.object({
  themeId: z.number().int().positive(),
  pageId: z.number().int().positive().optional(),
  fields: customSchema.optional(),
  background: backgroundAdjustmentSchema.nullable().optional(),
  copyName: z.string().trim().min(1).max(100).optional(),
});

type ApplyResult = ActionResult<{ themeId: number }> | (ActionError & { needsCopyName: true });

async function getThemeActor() {
  const session = await getSession();
  if (!session) return null;
  const { caps } = await getCapabilitiesForUser(session.userId);
  return { userId: session.userId, caps };
}

function revalidateThemes(publicPath?: string) {
  try {
    revalidatePath("/theme");
    if (publicPath) revalidatePath(publicPath, "layout");
  } catch (error) {
    // The transaction already committed. Cache refresh is best-effort.
    logError("revalidateThemes", error, { publicPath });
  }
}

const runApplyTheme = withAction("applyTheme", async (input: z.input<typeof applySchema>): Promise<ApplyResult> => {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const actor = await getThemeActor();
  if (!actor) return unauthorizedError();

  const parsed = applySchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  const { themeId, pageId, fields = {}, background, copyName } = parsed.data;
  if (pageId === undefined && !actor.caps.manageInstance) return forbiddenError();
  if (pageId === undefined && background !== undefined) return validationError("Invalid page id");
  if (sanitizeThemeFields(fields).dropped.length) return validationError("Invalid input");
  const editsTheme = Object.keys(fields).length > 0;

  // Access checks, shared-theme detection, and writes use the same short
  // transaction. Revalidation and other asynchronous work stay outside it.
  const result = db.transaction<ApplyResult & { slug?: string }>((tx) => {
    const page = pageId === undefined ? undefined : tx.select().from(pages).where(eq(pages.id, pageId)).get();
    if (pageId !== undefined && !page) return notFoundError("Page not found");
    if (page && !canEditPage(actor.caps, actor, page)) return forbiddenError();

    const theme = tx.select().from(themes).where(eq(themes.id, themeId)).get();
    if (!theme || !(actor.caps.manageInstance || theme.isPreset || theme.isActive ||
      theme.ownerId === actor.userId || page?.themeId === themeId)) {
      return notFoundError("Theme not found");
    }

    const editedTheme = { ...theme, ...fields };
    const previousTheme = page && (
      (page.themeId && tx.select().from(themes).where(eq(themes.id, page.themeId)).get()) ||
      tx.select().from(themes).where(eq(themes.isActive, true)).get()
    );

    let appliedThemeId = themeId;
    if (editsTheme) {
      for (const ref of [fields.fontFamily, fields.cardFontFamily]) {
        const id = parseCustomFontId(ref);
        if (id && !tx.select({ id: customFonts.id }).from(customFonts).where(eq(customFonts.id, id)).get()) {
          return validationError("That custom font no longer exists");
        }
      }

      const ownerId = page?.userId ?? actor.userId;
      const usedByOtherPage = Boolean(tx.select({ id: pages.id }).from(pages).where(and(
        eq(pages.themeId, themeId),
        pageId === undefined ? undefined : ne(pages.id, pageId),
      )).get());
      const canUpdate = canEditThemeInPlace(theme, {
        ownerId,
        pageId,
        manageInstance: actor.caps.manageInstance,
        usedByOtherPage,
      });

      if (copyName) {
        if (themeNameExists(copyName, ownerId, tx)) {
          return conflictError("A theme with this name already exists");
        }
        appliedThemeId = insertThemeCopy(tx, editedTheme, copyName, ownerId).id;
      } else if (canUpdate) {
        tx.update(themes).set({ ...fields, ownerId: theme.ownerId ?? ownerId }).where(eq(themes.id, themeId)).run();
      } else {
        return { ...conflictError("Name is required"), needsCopyName: true };
      }
    }

    if (page) {
      const adjustment = background !== undefined ? background
        : previousTheme && sameBackgroundMedia(previousTheme, editedTheme) ? undefined : null;
      const keepsInheritedTheme = !editsTheme && background !== undefined && page.themeId === null &&
        previousTheme?.id === appliedThemeId;
      tx.update(pages).set({
        themeId: keepsInheritedTheme ? null : appliedThemeId,
        ...(adjustment === undefined ? {} : {
          backgroundFitOverride: adjustment?.fit ?? null,
          backgroundPosX: adjustment?.posX ?? null,
          backgroundPosY: adjustment?.posY ?? null,
          backgroundZoom: adjustment?.zoom ?? null,
        }),
      }).where(eq(pages.id, page.id)).run();
    } else if (!theme.isActive || appliedThemeId !== themeId) {
      markActiveTheme(tx, appliedThemeId);
    }

    return { success: true, themeId: appliedThemeId, slug: page?.slug };
  }, { behavior: "immediate" });

  if (!result.success) return result;
  revalidateThemes(result.slug ? `/${result.slug}` : "/");
  return { success: true, themeId: result.themeId };
});

export async function applyTheme(input: z.input<typeof applySchema>): Promise<ApplyResult> {
  return runApplyTheme(input);
}

const runDuplicateTheme = withAction("duplicateActiveTheme", async (name: string, themeId: number): Promise<ActionResult<{ themeId: number }>> => {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const actor = await getThemeActor();
  if (!actor) return unauthorizedError();
  if (!Number.isSafeInteger(themeId) || themeId <= 0) return validationError("Invalid theme id");
  const trimmed = typeof name === "string" ? name.trim().slice(0, 100) : "";
  if (!trimmed) return validationError("Name is required");

  const result = db.transaction<ActionResult<{ themeId: number }>>((tx) => {
    const theme = tx.select().from(themes).where(eq(themes.id, themeId)).get();
    if (!theme || !(actor.caps.manageInstance || theme.isPreset || theme.isActive || theme.ownerId === actor.userId)) {
      return notFoundError("Theme not found");
    }
    if (themeNameExists(trimmed, actor.userId, tx)) {
      return conflictError("A theme with this name already exists");
    }
    const copy = insertThemeCopy(tx, theme, trimmed, actor.userId);
    return { success: true, themeId: copy.id };
  }, { behavior: "immediate" });
  if (result.success) revalidateThemes();
  return result;
});

export async function duplicateActiveTheme(name: string, themeId: number): Promise<ActionResult<{ themeId: number }>> {
  return runDuplicateTheme(name, themeId);
}

const runDeleteTheme = withAction("deleteCustomTheme", async (id: number): Promise<ActionResult> => {
  const blocked = demoGuard();
  if (blocked) return blocked;
  const actor = await getThemeActor();
  if (!actor) return unauthorizedError();
  if (!Number.isSafeInteger(id) || id <= 0) return validationError("Invalid theme id");

  const result = db.transaction<ActionResult>((tx) => {
    const theme = tx.select().from(themes).where(eq(themes.id, id)).get();
    if (!theme || !(actor.caps.manageInstance || theme.ownerId === actor.userId)) {
      return notFoundError("Theme not found");
    }
    if (theme.isActive) return validationError("Cannot delete the active theme");
    if (theme.isPreset) return validationError("Built-in themes cannot be deleted");
    if (!actor.caps.manageInstance && tx.select({ id: pages.id }).from(pages).where(and(
      eq(pages.themeId, id),
      or(ne(pages.userId, actor.userId), isNull(pages.userId)),
    )).get()) {
      return forbiddenError();
    }
    removeTheme(tx, id);
    return { success: true };
  }, { behavior: "immediate" });
  if (result.success) revalidateThemes("/");
  return result;
});

export async function deleteCustomTheme(id: number): Promise<ActionResult> {
  return runDeleteTheme(id);
}
