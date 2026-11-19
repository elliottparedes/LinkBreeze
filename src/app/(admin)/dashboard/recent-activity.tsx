import { getTranslations } from "next-intl/server";
import { getPlatformLabel, isSocialPlatform } from "@/lib/social-icons";
import type { ActivityRow } from "@/server/insights";

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
  locale,
}: {
  rows: ActivityRow[];
  locale: string;
}) {
  const t = await getTranslations("dashboard");

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
            return (
              <li key={`${row.kind}-${row.createdAt}-${index}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">
                  {label}
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
    </div>
  );
}
