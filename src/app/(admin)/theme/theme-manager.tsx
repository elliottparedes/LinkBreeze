"use client";

import * as React from "react";
import { localizeActionError } from "@/lib/action-error-i18n";
import { useRouter } from "next/navigation";
import {
  activateTheme,
  customizeActiveTheme,
  duplicateActiveTheme,
  deleteCustomTheme,
} from "@/server/actions/theme";
import { setPageThemeAction } from "@/server/actions/pages";
import { updatePageAction } from "@/server/actions/pages";
import type { ThemeRow } from "@/server/queries";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PresetGallery } from "./components/preset-gallery";
import { ThemeCustomizer } from "./components/theme-customizer";
import { ThemeActions } from "./components/theme-actions";
import { usePreview } from "@/components/admin/PreviewPane";
import { useSavedAction, createAutosaver, sameFormData, cloneFormData } from "@/hooks/use-saved-action";
import type { CustomFontMeta } from "@/lib/custom-fonts";

interface ThemeManagerProps {
  themes: ThemeRow[];
  activeId: number | null;
  active: ThemeRow | null;
  pageId?: number;
  pageThemeId?: number | null;
  /** False when this page still uses a shared preset or the instance theme.
   *  Edits then go through "save a copy" instead of changing that shared row. */
  ownsTheme?: boolean;
  customFonts?: CustomFontMeta[];
  /** Per-upload background adjustment from the page row (Spec: Image-Positioning). */
  pageBgAdjustment?: { fit: string | null; posX: number | null; posY: number | null; zoom: number | null } | null;
}

export function ThemeManager({
  themes,
  activeId,
  active,
  pageId,
  pageThemeId,
  ownsTheme = true,
  customFonts = [],
  pageBgAdjustment = null,
}: ThemeManagerProps) {
  const t = useTranslations("theme");
  const tErr = useTranslations("errors");
  const { reload: reloadPreview } = usePreview();
  // Shared save flow (Spec A): every success refreshes the router AND
  // cache-bust-reloads the preview. No per-form preview logic anywhere.
  const savedAction = useSavedAction();
  const [selecting, setSelecting] = React.useState<number | null>(null);
  const [customPending, setCustomPending] = React.useState(false);
  const [customError, setCustomError] = React.useState<string | null>(null);
  const [forkPending, setForkPending] = React.useState(false);
  const [delPending, setDelPending] = React.useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<number | null>(null);
  const router = useRouter();

  const handleSelect = async (id: number) => {
    setSelecting(id);
    try {
      if (pageId) {
        await setPageThemeAction(pageId, id);
      } else {
        await activateTheme(id);
      }
      router.refresh();
      reloadPreview();
    } finally {
      setSelecting(null);
    }
  };

  const handleCustom = async (formData: FormData) => {
    setCustomPending(true);
    setCustomError(null);
    try {
      const res = await savedAction.run(customizeActiveTheme, formData);
      if (!res.success) {
        setCustomError(localizeActionError(tErr, res.error));
      } else {
        router.refresh();
      }
    } catch {
      setCustomError("Failed to save theme. Please try again.");
    } finally {
      setCustomPending(false);
    }
  };

  // Saving a preset forks it: duplicate → apply the pending customizations →
  // point the page at the new copy (or activate it globally).
  const handleFork = async (name: string, formData: FormData) => {
    setForkPending(true);
    setCustomError(null);
    try {
      const dup = await duplicateActiveTheme(name, active?.id);
      if (!dup.success) {
        setCustomError(dup.error);
        return;
      }
      const fd = new FormData();
      for (const [k, v] of formData.entries()) fd.append(k, v);
      fd.set("themeId", String(dup.themeId));
      const res = await savedAction.run(customizeActiveTheme, fd);
      if (!res.success) {
        setCustomError(localizeActionError(tErr, res.error));
        return;
      }
      // Point this page (or the global default) at the new theme.
      if (pageId) {
        await setPageThemeAction(pageId, dup.themeId);
      } else {
        await activateTheme(dup.themeId);
      }
      router.refresh();
      reloadPreview();
    } catch {
      setCustomError("Failed to save theme. Please try again.");
    } finally {
      setForkPending(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDelPending(id);
    setDeleteTarget(null);
    try {
      await deleteCustomTheme(id);
      router.refresh();
      reloadPreview();
    } finally {
      setDelPending(null);
    }
  };

  // Uploaded fonts (#82): after upload/delete the server revalidated /theme,
  // but the client tree needs a refresh for the new chips + usage counts.
  const refreshAfterFontChange = React.useCallback(() => {
    router.refresh();
    reloadPreview();
  }, [router, reloadPreview]);

  // ── Debounced autosave (Spec B) — custom themes only ────────────────────
  // Each customizer change re-schedules a flush ~600ms out; the flush runs
  // the SAME savedAction path as an explicit save (refresh + preview reload).
  // Presets keep the explicit fork dialog — never autosaved.
  const isCustom = Boolean(active && !active.isPreset && ownsTheme);
  // Latest pending state + the last flushed baseline, read at flush time via
  // a getter indirection (the linter forbids touching refs inside useMemo).
  const pendingFdRef = React.useRef<{ fd: FormData; saved: FormData | null } | null>(null);
  const runThemeAutosave = React.useCallback(
    (fd: FormData, saved: FormData | null) => {
      // Skip when the pending state matches the last save already flushed —
      // no duplicate write of identical state.
      if (saved && sameFormData(saved, fd)) return;
      void savedAction.run(customizeActiveTheme, cloneFormData(fd));
    },
    [savedAction],
  );
  const themeAutosave = React.useMemo(() => createAutosaver(runThemeAutosave, 600), [runThemeAutosave]);
  React.useEffect(() => () => themeAutosave.cancel(), [themeAutosave]);

  // Called by the customizer on every controlled-state change. Autosaves
  // only when the edited theme is already a custom (non-preset) theme.
  const handleAutoSaveState = React.useCallback(
    (formData: FormData) => {
      if (!isCustom) return; // presets keep explicit fork-save only
      const prev = pendingFdRef.current;
      pendingFdRef.current = { fd: formData, saved: prev?.saved ?? null };
      themeAutosave.schedule(formData, pendingFdRef.current.saved);
    },
    [isCustom, themeAutosave],
  );
  // Explicit save marks the just-saved state as the autosave baseline so the
  // next flush doesn't re-send identical data; blur flushes any pending edit.
  const markThemeAutosaveSaved = React.useCallback((formData: FormData) => {
    if (pendingFdRef.current) pendingFdRef.current.saved = cloneFormData(formData);
  }, []);
  const flushThemeAutosave = React.useCallback(() => {
    themeAutosave.flushNow();
  }, [themeAutosave]);

  // ── Per-upload background adjustment (Spec: Image-Positioning) ──
  // Page-level metadata persisted straight through the page action so the
  // live preview reloads; null resets to theme-default rendering.
  const handleBgAdjustment = React.useCallback(
    (v: { fit: "cover" | "contain"; posX: number; posY: number; zoom: number } | null) => {
      if (!pageId) return;
      const fd = new FormData();
      fd.set("pageId", String(pageId));
      if (v) {
        fd.set("backgroundFitOverride", v.fit);
        fd.set("backgroundPosX", String(v.posX));
        fd.set("backgroundPosY", String(v.posY));
        fd.set("backgroundZoom", String(v.zoom));
      } else {
        fd.set("backgroundFitOverride", "");
        fd.set("backgroundPosX", "");
        fd.set("backgroundPosY", "");
        fd.set("backgroundZoom", "");
      }
      void savedAction.run(updatePageAction, fd);
    },
    [pageId, savedAction],
  );

  const effectiveActiveId = pageId ? (pageThemeId ?? activeId) : activeId;

  return (
    <div className="flex flex-col gap-8">
      {/* Header row: title left, actions top-right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("chooseAPresetOrFullyCustomiseYourPage")}</p>
        </div>
        <ThemeActions themes={themes} active={active} />
      </div>

      <PresetGallery
        themes={themes}
        activeId={effectiveActiveId}
        selecting={selecting}
        delPending={delPending}
        onSelect={handleSelect}
        onDeleteClick={setDeleteTarget}
      />

      {active ? (
        <ThemeCustomizer
          active={active}
          onCustomize={handleCustom}
          customPending={customPending}
          customError={customError}
          isCustom={isCustom}
          onFork={handleFork}
          forkPending={forkPending}
          customFonts={customFonts}
          themes={themes}
          onFontUploaded={refreshAfterFontChange}
          onFontDeleted={refreshAfterFontChange}
          onAutoSaveState={handleAutoSaveState}
          onAutoSaveFlush={markThemeAutosaveSaved}
          onAutoSaveBlur={flushThemeAutosave}
          bgAdjustment={pageBgAdjustment}
          onBgAdjustment={handleBgAdjustment}
        />
      ) : null}

      {/* Delete confirmation dialog — replaces native confirm() */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("deleteCustomConfirm")}</DialogTitle>
            <DialogDescription>{t("thisActionCannotBeUndoneTheThemeWillBePe")}</DialogDescription>
      </DialogHeader>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setDeleteTarget(null)}>{t("cancel")}</Button>
            <Button
              variant="destructive"
              type="button"
              disabled={delPending !== null}
              onClick={() => { if (deleteTarget !== null) handleDelete(deleteTarget); }}
            >
              {delPending !== null ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
