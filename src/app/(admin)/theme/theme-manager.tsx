"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ImagePositionPickerValue } from "@/components/admin/image-position-picker";
import { usePreview } from "@/components/admin/PreviewPane";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSavedAction } from "@/hooks/use-saved-action";
import { localizeActionError } from "@/lib/action-error-i18n";
import type { CustomFontMeta } from "@/lib/custom-fonts";
import { sameBackgroundMedia } from "@/lib/theme-editing";
import { applyTheme, deleteCustomTheme, duplicateActiveTheme } from "@/server/actions/theme";
import type { ThemeRow } from "@/server/queries";
import { PresetGallery } from "./components/preset-gallery";
import { ThemeActions } from "./components/theme-actions";
import {
  stateFromTheme,
  ThemeCustomizer,
  type BackgroundAdjustment,
  type CustomizerState,
} from "./components/theme-customizer";

type ThemeDraft = {
  fields: Partial<CustomizerState>;
  background?: Pick<CustomizerState, "backgroundType" | "backgroundImageUrl"> & {
    value: ImagePositionPickerValue | null;
  };
};

type ThemeSession = { selectedId?: number; drafts: Record<number, ThemeDraft> };
type GallerySection = "presets" | "mine" | "other";
type CopyDialog = { purpose: "edit" | "apply"; name: string };

const sectionLabels = { presets: "presetThemes", mine: "myThemes", other: "savedThemes" } as const;

const emptySession: ThemeSession = { drafts: {} };
const subscribeToSession = () => () => {};
const serverSession = () => null;

interface ThemeManagerProps {
  userId: number;
  themes: ThemeRow[];
  active: ThemeRow | null;
  pageId?: number;
  canApply: boolean;
  manageInstance: boolean;
  editableThemeIds: number[];
  customFonts?: CustomFontMeta[];
  pageBgAdjustment?: BackgroundAdjustment | null;
}

export function ThemeManager({
  userId,
  themes,
  active,
  pageId,
  canApply,
  manageInstance,
  editableThemeIds,
  customFonts = [],
  pageBgAdjustment = null,
}: ThemeManagerProps) {
  const t = useTranslations("theme");
  const tErr = useTranslations("errors");
  const router = useRouter();
  const { reload: reloadPreview } = usePreview();
  const savedAction = useSavedAction();

  const storageKey = `linkbreeze:theme-drafts:v1:${userId}:${pageId ?? "default"}`;
  const readStorage = React.useCallback(() => {
    try {
      return sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  }, [storageKey]);
  const stored = React.useSyncExternalStore(subscribeToSession, readStorage, serverSession);
  const restoredSession = React.useMemo(() => {
    try {
      const parsed = stored ? JSON.parse(stored) as ThemeSession : null;
      return parsed?.drafts ? parsed : emptySession;
    } catch {
      return emptySession;
    }
  }, [stored]);
  const [memorySession, setMemorySession] = React.useState<ThemeSession | null>(null);
  const session = memorySession ?? restoredSession;

  const [gallerySection, setGallerySection] = React.useState<GallerySection | null>(null);
  const [pending, setPending] = React.useState(false);
  const busy = React.useRef(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copyDialog, setCopyDialog] = React.useState<CopyDialog | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<number | null>(null);

  const selected = themes.find((theme) => theme.id === session.selectedId) ?? active;
  const draft = selected ? session.drafts[selected.id] : undefined;
  const initial = selected ? stateFromTheme(selected) : null;
  const state = initial ? { ...initial, ...draft?.fields } : null;
  const draftBackground = state && draft?.background && sameBackgroundMedia(state, draft.background)
    ? draft.background.value
    : undefined;
  const bgAdjustment = draftBackground !== undefined ? draftBackground
    : state && active && sameBackgroundMedia(state, active) ? pageBgAdjustment : null;
  const hasThemeEdits = Object.keys(draft?.fields ?? {}).length > 0;
  const dirty = hasThemeEdits || draftBackground !== undefined;
  const isLive = selected?.id === active?.id;
  const canPublish = canApply && (selected?.isPreset ? !isLive && !dirty : !isLive || dirty);
  const sections: Record<GallerySection, ThemeRow[]> = { presets: [], mine: [], other: [] };
  for (const theme of themes) {
    const category = theme.isPreset ? "presets" : theme.ownerId === userId ? "mine" : "other";
    sections[category].push(theme);
  }
  const categories: GallerySection[] = sections.other.length ? ["presets", "mine", "other"] : ["presets", "mine"];
  const selectedCategory = categories.find((category) =>
    sections[category].some((theme) => theme.id === selected?.id)
  ) ?? "presets";
  const section = gallerySection && categories.includes(gallerySection) ? gallerySection : selectedCategory;
  const galleryThemes = sections[section];

  function writeSession(next: ThemeSession) {
    setMemorySession(next);
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Keep editing with the in-memory draft if browser storage is unavailable.
    }
  }

  function selectTheme(id: number) {
    if (busy.current) return;
    setError(null);
    setGallerySection(null);
    writeSession({ ...session, selectedId: id });
  }

  function updateDraft(next: ThemeDraft) {
    if (!selected || busy.current) return;
    const drafts = { ...session.drafts };
    if (Object.keys(next.fields).length || next.background) drafts[selected.id] = next;
    else delete drafts[selected.id];
    writeSession({ ...session, drafts });
  }

  function updateFields(patch: Partial<CustomizerState>) {
    if (!initial) return;
    const fields = { ...draft?.fields };
    for (const key of Object.keys(patch) as (keyof CustomizerState)[]) {
      const value = patch[key];
      if (value === undefined || value === initial[key]) delete fields[key];
      else fields[key] = value;
    }
    updateDraft({ ...draft, fields });
  }

  function updateBackground(value: ImagePositionPickerValue | null) {
    if (!state) return;
    updateDraft({
      fields: draft?.fields ?? {},
      background: {
        backgroundType: state.backgroundType,
        backgroundImageUrl: state.backgroundImageUrl,
        value,
      },
    });
  }

  function openCopyDialog(purpose: CopyDialog["purpose"]) {
    if (!selected) return;
    setError(null);
    setCopyDialog({ purpose, name: t("themeCopyName", { name: selected.name.slice(0, 80) }) });
  }

  function closeCopyDialog() {
    setCopyDialog(null);
    setError(null);
  }

  async function copyPresetForEditing(name: string) {
    if (!selected?.isPreset || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await duplicateActiveTheme(name, selected.id);
      if (!result.success) {
        setError(localizeActionError(tErr, result.error));
        return;
      }
      const drafts = { ...session.drafts };
      if (draft) {
        drafts[result.themeId] = draft;
        delete drafts[selected.id];
      }
      writeSession({ selectedId: result.themeId, drafts });
      setGallerySection("mine");
      setCopyDialog(null);
    } catch {
      setError(tErr("somethingWentWrong"));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function commit(name?: string) {
    if (!selected || !canApply || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await savedAction.run(applyTheme, {
        themeId: selected.id,
        pageId,
        fields: draft?.fields,
        background: draftBackground,
        copyName: name,
      });
      if (!result.success) {
        if ("needsCopyName" in result) openCopyDialog("apply");
        else setError(localizeActionError(tErr, result.error));
        return;
      }
      const drafts = { ...session.drafts };
      delete drafts[selected.id];
      writeSession({ selectedId: result.themeId, drafts });
      setGallerySection(null);
      setCopyDialog(null);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function handleDelete() {
    if (deleteTarget === null || busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await savedAction.run(deleteCustomTheme, deleteTarget);
      if (!result.success) {
        setError(localizeActionError(tErr, result.error));
        return;
      }
      const drafts = { ...session.drafts };
      delete drafts[deleteTarget];
      writeSession({
        selectedId: session.selectedId === deleteTarget ? active?.id : session.selectedId,
        drafts,
      });
      setDeleteTarget(null);
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  const refreshAfterFontChange = () => {
    router.refresh();
    reloadPreview();
  };
  const errorMessage = error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t(pageId === undefined && canApply ? "instanceThemeScope" : "browseThemes")}
          </p>
        </div>
        {manageInstance ? <ThemeActions themes={themes} active={active} /> : null}
      </div>

      <section className="min-w-0 space-y-2" aria-label={t("title")}>
        <div className="flex gap-2">
          {categories.map((category) => (
            <Button
              key={category}
              type="button"
              variant={section === category ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={section === category}
              onClick={() => setGallerySection(category)}
            >
              {t(sectionLabels[category])}
            </Button>
          ))}
        </div>
        {galleryThemes.length ? (
          <PresetGallery
            themes={galleryThemes}
            activeId={active?.id ?? null}
            selectedId={selected?.id ?? null}
            draftIds={new Set(Object.keys(session.drafts).map(Number))}
            pending={pending}
            onSelect={selectTheme}
            onDeleteClick={(id) => { setError(null); setDeleteTarget(id); }}
          />
        ) : (
          <p className="px-2 py-4 text-sm text-muted-foreground">{t("noSavedThemes")}</p>
        )}
      </section>

      {copyDialog === null && deleteTarget === null ? errorMessage : null}
      {selected && state ? (
        <ThemeCustomizer
          name={selected.name}
          state={state}
          set={updateFields}
          pending={pending}
          readOnly={selected.isPreset}
          description={t(dirty ? "draftInThisTab" : isLive ? "thisThemeIsLive" : "previewThemeNote")}
          actions={(
            <div className="flex flex-wrap gap-2">
              {!isLive && active ? (
                <Button variant="ghost" size="sm" type="button" disabled={pending} onClick={() => selectTheme(active.id)}>
                  {t("backToLiveTheme")}
                </Button>
              ) : null}
              {dirty ? (
                <Button variant="outline" size="sm" type="button" disabled={pending} onClick={() => { setError(null); updateDraft({ fields: {} }); }}>
                  {t("discardThemeEdits")}
                </Button>
              ) : null}
              {selected.isPreset ? (
                <Button size="sm" type="button" disabled={pending} onClick={() => openCopyDialog("edit")}>
                  {t("editPreset")}
                </Button>
              ) : null}
              {canPublish ? (
                <Button variant={selected.isPreset ? "outline" : "default"} size="sm" type="button" disabled={pending} onClick={() => {
                  if (hasThemeEdits && !editableThemeIds.includes(selected.id)) openCopyDialog("apply");
                  else void commit();
                }}>
                  {t(pending ? (dirty ? "saving" : "applying") : dirty ? "saveAndApplyTheme" : "applyTheme")}
                </Button>
              ) : null}
            </div>
          )}
          customFonts={customFonts}
          themes={themes}
          onFontUploaded={refreshAfterFontChange}
          onFontDeleted={refreshAfterFontChange}
          bgAdjustment={bgAdjustment}
          onBgAdjustment={pageId === undefined ? undefined : updateBackground}
        />
      ) : null}

      <Dialog open={copyDialog !== null} onOpenChange={(open) => {
        if (!open && !pending) closeCopyDialog();
      }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t(copyDialog?.purpose === "edit" ? "editPreset" : "saveAsOwn")}</DialogTitle>
            <DialogDescription>
              {t(copyDialog?.purpose === "edit" ? "editPresetCopyNote" : "saveThemeCopyNote", { name: selected?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => {
            event.preventDefault();
            if (!copyDialog) return;
            const name = copyDialog.name.trim();
            if (!name) return;
            if (copyDialog.purpose === "edit") void copyPresetForEditing(name);
            else void commit(name);
          }}>
            <div className="grid gap-1.5">
              <label htmlFor="save-theme-name" className="text-sm">{t("newThemeName")}</label>
              <Input
                id="save-theme-name"
                value={copyDialog?.name ?? ""}
                onChange={(event) => {
                  if (copyDialog) setCopyDialog({ ...copyDialog, name: event.target.value });
                }}
                disabled={pending}
                required
                maxLength={100}
              />
            </div>
            {errorMessage}
            <DialogFooter>
              <Button variant="outline" type="button" disabled={pending} onClick={closeCopyDialog}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending || !copyDialog?.name.trim()}>
                {copyDialog?.purpose === "edit"
                  ? t(pending ? "creating" : "createTheme")
                  : t(pending ? "saving" : "saveAndApplyTheme")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => {
        if (!open && !pending) { setDeleteTarget(null); setError(null); }
      }}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("deleteCustomConfirm")}</DialogTitle>
            <DialogDescription>{t("deleteThemeNote")}</DialogDescription>
          </DialogHeader>
          {errorMessage}
          <DialogFooter>
            <Button variant="outline" type="button" disabled={pending} onClick={() => { setDeleteTarget(null); setError(null); }}>
              {t("cancel")}
            </Button>
            <Button variant="destructive" type="button" disabled={pending} onClick={handleDelete}>
              {t(pending ? "deleting" : "delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
