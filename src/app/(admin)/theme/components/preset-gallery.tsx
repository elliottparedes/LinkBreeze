"use client";

import { Check, Trash2 } from "lucide-react";
import type { ThemeRow } from "@/server/queries";
import { Badge } from "@/components/ui/badge";
import { resolveBackground } from "@/lib/theme-tokens";
import { useTranslations } from "next-intl";

interface PresetGalleryProps {
  themes: ThemeRow[];
  activeId: number | null;
  selectedId: number | null;
  draftIds: Set<number>;
  pending: boolean;
  onSelect: (id: number) => void;
  onDeleteClick: (id: number) => void;
}

/**
 * Build a mini visual preview of a theme using its actual tokens.
 * Uses the production resolveBackground so the card matches what the public
 * page renders (including aurora's base color and image overlays).
 */
function ThemePreview({ theme }: { theme: ThemeRow }) {
  const isAurora = theme.backgroundType === "aurora";
  const bg = resolveBackground(theme);
  // resolveBackground already composes fit + focal point into the background
  // shorthand for image/gif media; extra size/position overrides would fight it.
  const bgStyle: React.CSSProperties = isAurora
    ? { background: theme.backgroundValue?.split(",")[0]?.trim() || "#0a0820" }
    : { background: bg };

  const radius = theme.radius ?? "12px";
  const isPill = theme.linkStyle === "pill";
  const isSharp = theme.linkStyle === "sharp";
  const isPixel = theme.linkStyle === "pixel";
  const isGel = theme.linkStyle === "gel";

  const cardRadius = isPill || isGel ? "9999px" : isSharp || isPixel ? "0px" : radius;

  // Fake link card
  const fakeCard: React.CSSProperties = {
    background: theme.cardBackground ?? "rgba(255,255,255,0.1)",
    padding: "4px 8px",
    marginBottom: "4px",
  };

  if (isPixel) {
    fakeCard.clipPath = "polygon(4px 0,calc(100% - 4px) 0,calc(100% - 4px) 2px,calc(100% - 2px) 2px,calc(100% - 2px) 4px,100% 4px,100% calc(100% - 4px),calc(100% - 2px) calc(100% - 4px),calc(100% - 2px) calc(100% - 2px),calc(100% - 4px) calc(100% - 2px),calc(100% - 4px) 100%,4px 100%,4px calc(100% - 2px),2px calc(100% - 2px),2px 4px,0 4px)";
    fakeCard.boxShadow = `0 0 0 2px ${theme.cardBorderColor ?? "#ea580c"}`;
  } else {
    fakeCard.border = `1px solid ${theme.cardBorderColor ?? "rgba(255,255,255,0.1)"}`;
    fakeCard.borderRadius = cardRadius;
  }

  return (
    <div className="relative flex h-32 flex-col items-center justify-center overflow-hidden p-3" style={bgStyle}>
      {/* Mini avatar circle */}
      <div
        className="mb-2 h-6 w-6 rounded-full"
        style={{
          background: theme.primaryColor ?? "#7c5ff0",
          border: `2px solid ${theme.primaryColor ?? "#7c5ff0"}`,
        }}
      />
      {/* Name bar */}
      <div
        className="mb-2 h-1.5 w-16 rounded-full"
        style={{ background: theme.textColor ?? "#fff", opacity: 0.8 }}
      />
      {/* Fake link cards */}
      <div className="w-full px-2">
        <div style={fakeCard}>
          <div className="h-1 w-full rounded-full" style={{ background: theme.textColor ?? "#fff", opacity: 0.5 }} />
        </div>
        <div style={{ ...fakeCard, marginBottom: 0 }}>
          <div className="h-1 w-3/4 rounded-full" style={{ background: theme.primaryColor ?? "#7c5ff0", opacity: 0.7 }} />
        </div>
      </div>
    </div>
  );
}

export function PresetGallery({
  themes,
  activeId,
  selectedId,
  draftIds,
  pending,
  onSelect,
  onDeleteClick,
}: PresetGalleryProps) {
  const t = useTranslations("theme");
  return (
    <div className="grid auto-cols-[10.5rem] grid-flow-col gap-3 overflow-x-auto px-1 py-1 sm:auto-cols-[12rem]">
      {themes.map((theme) => {
        const isActive = theme.id === activeId;
        const isSelected = theme.id === selectedId;
        const hasDraft = draftIds.has(theme.id);
        return (
          <div
            key={theme.id}
            className="group relative overflow-hidden rounded-xl border border-border text-start transition-[border-color,box-shadow] hover:ring-2 hover:ring-ring/50 data-[selected=true]:ring-2 data-[selected=true]:ring-primary"
            data-selected={isSelected}
          >
            <button
              onClick={() => onSelect(theme.id)}
              className="block h-full w-full text-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              type="button"
              aria-pressed={isSelected}
              disabled={pending}
            >
              <ThemePreview theme={theme} />
              <div className="bg-card p-2.5">
                <div className="truncate text-sm font-medium text-foreground">{theme.name}</div>
                <div className="mt-1 flex min-h-5 flex-wrap items-center gap-1">
                  {isActive ? (
                    <Badge className="shrink-0 border-transparent bg-[var(--aurora-grad)] text-white">
                      <Check className="size-3" /> {t("liveTheme")}
                    </Badge>
                  ) : null}
                  {isSelected && !isActive ? <Badge variant="secondary">{t("previewingTheme")}</Badge> : null}
                  {hasDraft ? <Badge variant="outline">{t("themeDraft")}</Badge> : null}
                </div>
              </div>
            </button>
            {/* Delete button for non-preset, non-active custom themes */}
            {!theme.isPreset && !isActive && !theme.isActive ? (
              <button
                type="button"
                onClick={() => onDeleteClick(theme.id)}
                disabled={pending}
                className="absolute end-1.5 top-1.5 rounded-md bg-black/60 p-1.5 text-white hover:bg-destructive"
                aria-label={t("deleteNamedTheme", { name: theme.name })}
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
