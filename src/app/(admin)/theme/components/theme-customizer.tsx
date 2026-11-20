"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import type { ThemeRow } from "@/server/queries";
import type { ImagePositionPickerValue } from "@/components/admin/image-position-picker";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeLivePreview } from "./theme-live-preview";
import {
  BackgroundSection,
  ColorsSection,
  TypographySection,
  CardStyleSection,
  DividerSection,
  LayoutSection,
  EffectsSection,
  ProfileSection,
} from "./theme-customizer-sections";
import type { CustomFontMeta } from "@/lib/custom-fonts";

/** Shape of the controlled customizer state (strings, matching the form fields). */
export type CustomizerState = {
  backgroundType: string;
  backgroundValue: string;
  backgroundAngle: string;
  backgroundImageUrl: string;
  backgroundFit: string;
  backgroundPosition: string;
  overlayColor: string;
  overlayOpacity: string; // 0–100 (slider scale)
  primaryColor: string;
  secondaryColor: string;
  cardBackground: string;
  cardBorderColor: string;
  textColor: string;
  mutedTextColor: string;
  fontFamily: string;
  /** "" = cards inherit the site font; else a bundled id or "custom:<id>". */
  cardFontFamily: string;
  fontScale: string;
  fontWeight: string;
  letterSpacing: string;
  linkStyle: string;
  animationType: string;
  radius: string;
  buttonSize: string;
  borderWidth: string;
  shadowStrength: string;
  hoverEffect: string;
  containerWidth: string;
  alignment: string;
  density: string;
  glow: string;
  glowColor: string;
  blur: string;
  noise: string;
  avatarShape: string;
  avatarBorder: string;
  avatarFloat: string;
  /** "auto" or a px number string ("96"). */
  avatarSize: string;
  // #87 divider element styling
  dividerStyle: string;
  /** "" = inherit the theme's card border color. */
  dividerColor: string;
  /** px thickness as a string ("1"–"8"). */
  dividerThickness: string;
  /** percentage width as a string ("100"). */
  dividerWidth: string;
  profileLayout: string;
  textAnimation: string;
};

export type BackgroundAdjustment = {
  fit: string | null;
  posX: number | null;
  posY: number | null;
  zoom: number | null;
};

export function stateFromTheme(active: ThemeRow): CustomizerState {
  return {
    backgroundType: active.backgroundType ?? "gradient",
    backgroundValue: active.backgroundValue ?? "",
    backgroundAngle: active.backgroundAngle ?? "135deg",
    backgroundImageUrl: active.backgroundImageUrl ?? "",
    backgroundFit: active.backgroundFit ?? "cover",
    backgroundPosition: active.backgroundPosition ?? "50% 50%",
    overlayColor: active.overlayColor ?? "#000000",
    // Normalize legacy 0–1 rows to the 0–100 slider scale.
    overlayOpacity: normalizeOverlayScale(active.overlayOpacity),
    primaryColor: active.primaryColor ?? "#533fd6",
    secondaryColor: active.secondaryColor ?? "#a78bfa",
    cardBackground: active.cardBackground ?? "",
    cardBorderColor: active.cardBorderColor ?? "",
    textColor: active.textColor ?? "#eceafe",
    mutedTextColor: active.mutedTextColor ?? "",
    fontFamily: active.fontFamily ?? "inter",
    cardFontFamily: active.cardFontFamily ?? "",
    fontScale: active.fontScale ?? "100",
    fontWeight: active.fontWeight ?? "500",
    letterSpacing: active.letterSpacing ?? "0",
    linkStyle: active.linkStyle ?? "glass",
    animationType: active.animationType ?? "lift",
    radius: active.radius ?? "auto",
    buttonSize: active.buttonSize ?? "md",
    borderWidth: active.borderWidth ?? "1px",
    shadowStrength: active.shadowStrength ?? "medium",
    hoverEffect: active.hoverEffect ?? "lift",
    containerWidth: active.containerWidth ?? "540px",
    alignment: active.alignment ?? "center",
    density: active.density ?? "normal",
    glow: active.glow ?? "false",
    glowColor: active.glowColor ?? "#533fd6",
    blur: active.blur ?? "12px",
    noise: active.noise ?? "false",
    avatarShape: active.avatarShape ?? "circle",
    avatarBorder: active.avatarBorder ?? "solid",
    avatarFloat: active.avatarFloat ?? "false",
    avatarSize: active.avatarSize ?? "auto",
    dividerStyle: active.dividerStyle ?? "solid",
    dividerColor: active.dividerColor ?? "",
    dividerThickness: active.dividerThickness ?? "1",
    dividerWidth: active.dividerWidth ?? "100",
    profileLayout: active.profileLayout ?? "classic",
    textAnimation: active.textAnimation ?? "none",
  };
}

/** Legacy rows stored 0–1 fractions; the slider works on 0–100. */
function normalizeOverlayScale(raw: string | null | undefined): string {
  if (!raw) return "0";
  const num = parseFloat(raw);
  if (Number.isNaN(num)) return "0";
  return String(Math.round(num <= 1 ? num * 100 : num));
}

const TABS = [
  { id: "background", label: "tabBackground" },
  { id: "typography", label: "tabTypography" },
  { id: "links", label: "tabLinks" },
  { id: "profile", label: "tabProfile" },
  { id: "effects", label: "tabEffects" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function ThemeCustomizer({
  name,
  state,
  set,
  pending,
  readOnly,
  description,
  actions,
  customFonts = [],
  themes = [],
  onFontUploaded,
  onFontDeleted,
  bgAdjustment,
  onBgAdjustment,
}: {
  name: string;
  state: CustomizerState;
  set: (patch: Partial<CustomizerState>) => void;
  pending: boolean;
  readOnly: boolean;
  description: string;
  actions: React.ReactNode;
  /** Uploaded fonts (#82) — selectable alongside the bundled ones. */
  customFonts?: CustomFontMeta[];
  /** All themes — used by the font delete confirm (affected-theme list). */
  themes?: { id: number; name: string; fontFamily: string | null }[];
  /** Refresh after upload/delete so chips + usage counts stay accurate. */
  onFontUploaded?: () => void;
  onFontDeleted?: () => void;
  bgAdjustment?: BackgroundAdjustment | null;
  onBgAdjustment?: (value: ImagePositionPickerValue | null) => void;
}) {
  const t = useTranslations("theme");
  const [tab, setTab] = React.useState<TabId>("background");

  return (
      <Card className="w-full">
        <CardHeader className="flex flex-wrap items-start justify-between gap-3 pb-4">
          <div className="grid gap-1">
            <CardTitle>{readOnly ? name : t("customiseTitle", { name })}</CardTitle>
            <CardDescription aria-live="polite">{description}</CardDescription>
          </div>
          {actions}
        </CardHeader>
        <div className="flex flex-col gap-6 px-6 pb-4 xl:flex-row">
          {/* Vertical tab rail (horizontal strip below xl) */}
          {!readOnly ? <nav
            aria-label={t("customizerSections")}
            className="order-1 flex shrink-0 gap-1 overflow-x-auto pb-1 xl:w-40 xl:flex-col xl:pb-0"
          >
            {TABS.map((tabDef) => (
              <button
                key={tabDef.id}
                type="button"
                onClick={() => setTab(tabDef.id)}
                aria-current={tab === tabDef.id}
                className={`flex shrink-0 items-center rounded-lg px-3 py-2 text-xs font-medium transition-colors ${
                  tab === tabDef.id
                    ? "bg-[var(--aurora-grad)] text-white shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {t(tabDef.label)}
              </button>
            ))}
          </nav> : null}

          {/* Fields area */}
          {!readOnly ? <fieldset className="order-3 min-w-0 flex-1 xl:order-2" disabled={pending}>
            {tab === "background" ? (
              <>
                <BackgroundSection
                  s={state}
                  set={set}
                  bgAdjustment={bgAdjustment}
                  onBgAdjustment={onBgAdjustment}
                />
                <div className="mt-6">
                  <ColorsSection s={state} set={set} />
                </div>
              </>
            ) : null}
            {tab === "typography" ? (
              <TypographySection
                s={state}
                set={set}
                customFonts={customFonts}
                themes={themes}
                onFontUploaded={onFontUploaded}
                onFontDeleted={onFontDeleted}
              />
            ) : null}
            {tab === "links" ? (
              <>
                <CardStyleSection s={state} set={set} />
                <div className="mt-6">
                  <DividerSection s={state} set={set} />
                </div>
                <div className="mt-6">
                  <LayoutSection s={state} set={set} />
                </div>
              </>
            ) : null}
            {tab === "profile" ? <ProfileSection s={state} set={set} /> : null}
            {tab === "effects" ? <EffectsSection s={state} set={set} /> : null}
          </fieldset> : null}

          {/* Theme visualizer — sticky on wide screens */}
          <div className="order-2 mx-auto h-[276px] w-[144px] shrink-0 xl:sticky xl:top-20 xl:order-3 xl:h-[460px] xl:w-[268px]">
            <div className="w-[240px] origin-top-left scale-[.6] xl:scale-100">
              <ThemeLivePreview state={state} customFonts={customFonts} bgAdjustment={bgAdjustment} />
            </div>
          </div>
        </div>
      </Card>
  );
}
