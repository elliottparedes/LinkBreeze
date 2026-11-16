import { getTranslations } from "next-intl/server";
import { getPlatformLabel, isSocialPlatform } from "@/lib/social-icons";
import type { CampaignSource } from "@/lib/traffic-source";
import { CAMPAIGN_SOURCES } from "@/lib/traffic-source";
import type { ActivityRow, SocialTap } from "@/server/insights";

const SOURCE_KEY = {
  ig: "sourceIg",
  tiktok: "sourceTiktok",
  yt: "sourceYt",
  x: "sourceX",
  newsletter: "sourceNewsletter",
  qr: "sourceQr",
} as const;

function isCampaignSource(value: string | null): value is CampaignSource {
  return !!value && CAMPAIGN_SOURCES.some((source) => source.id === value);
}

function formatWhen(value: string, locale: string): string {
  const parsed = Date.parse(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(parsed)) return value;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(parsed));
}

export async function RecentActivity({
  rows,
  socialTaps,
  locale,
}: {
  rows: ActivityRow[];
  socialTaps: SocialTap[];
  locale: string;
}) {
  const t = await getTranslations("dashboard");
  const sourceName = (source: string | null) =>
    isCampaignSource(source) ? t(SOURCE_KEY[source]) : null;

  return (
    <div className="flex flex-col gap-3">
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("activityEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => {
            const label =
              row.kind === "view"
                ? t("activityView")
                : row.kind === "click"
                  ? t("activityClick", { title: row.title })
                  : t("activitySocial", {
                      platform: isSocialPlatform(row.title) ? getPlatformLabel(row.title) : row.title,
                    });
            const source = sourceName(row.source);
            return (
              <li key={`${row.kind}-${row.createdAt}-${index}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {label}
                  {source ? <span className="text-muted-foreground"> · {source}</span> : null}
                  {row.device ? <span className="text-muted-foreground"> · {row.device}</span> : null}
                </span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatWhen(row.createdAt, locale)}
                </time>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <div>
          <span className="font-heading text-sm font-medium">{t("socialTapsTitle")}</span>
          <p className="text-xs text-muted-foreground">{t("socialTapsDesc")}</p>
        </div>
        {socialTaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("socialTapsEmpty")}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {socialTaps.map((tap) => (
              <li key={tap.platform} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {isSocialPlatform(tap.platform) ? getPlatformLabel(tap.platform) : tap.platform}
                </span>
                <span className="tabular-nums text-muted-foreground">{tap.count}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
