import { getTranslations } from "next-intl/server";
import type { HeatCell } from "@/server/insights";

const BLOCKS = [0, 4, 8, 12, 16, 20];

function weekdayLabels(locale: string): string[] {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 7 + i))));
}

function blockCount(cells: HeatCell[], dow: number, start: number): number {
  return cells
    .filter((cell) => cell.dow === dow && cell.hour >= start && cell.hour < start + 4)
    .reduce((sum, cell) => sum + cell.count, 0);
}

export async function VisitHeatmap({ cells, locale }: { cells: HeatCell[]; locale: string }) {
  const t = await getTranslations("dashboard");
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);
  if (total === 0) {
    return <p className="text-sm text-muted-foreground">{t("heatmapEmpty")}</p>;
  }

  const days = weekdayLabels(locale);
  const max = Math.max(
    1,
    ...BLOCKS.flatMap((start) => days.map((_, dow) => blockCount(cells, dow, start))),
  );

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[16rem] grid-cols-[2.4rem_repeat(6,minmax(0,1fr))] gap-1">
        <span />
        {BLOCKS.map((hour) => (
          <span key={hour} className="text-center text-[10px] text-muted-foreground">
            {String(hour).padStart(2, "0")}
          </span>
        ))}
        {days.map((label, dow) => (
          <div key={label} className="contents">
            <span className="truncate text-[10px] leading-4 text-muted-foreground">{label}</span>
            {BLOCKS.map((start) => {
              const count = blockCount(cells, dow, start);
              const alpha = 0.12 + (count / max) * 0.88;
              return (
                <div
                  key={`${dow}-${start}`}
                  title={`${label} ${String(start).padStart(2, "0")}:00 UTC · ${count}`}
                  className="h-4 rounded-sm"
                  style={{ background: `rgba(167, 139, 250, ${count === 0 ? 0.08 : alpha})` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
