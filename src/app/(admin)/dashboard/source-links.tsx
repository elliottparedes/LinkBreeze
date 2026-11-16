"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CAMPAIGN_SOURCES, type CampaignSource } from "@/lib/traffic-source";

const LABEL_KEY = {
  ig: "sourceIg",
  tiktok: "sourceTiktok",
  yt: "sourceYt",
  x: "sourceX",
  newsletter: "sourceNewsletter",
  qr: "sourceQr",
} as const;

export function SourceLinks({
  slug,
  baseUrl,
  counts,
  untagged,
}: {
  slug: string;
  baseUrl: string;
  counts: Record<CampaignSource, number>;
  untagged: number;
}) {
  const t = useTranslations("dashboard");
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(id: CampaignSource) {
    const origin = (baseUrl || window.location.origin).replace(/\/$/, "");
    try {
      await navigator.clipboard.writeText(`${origin}/${slug}?s=${id}`);
      setCopied(id);
      window.setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500);
    } catch {
      // Clipboard can be denied. The count still shows; the URL is the button's title.
    }
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {CAMPAIGN_SOURCES.map((source) => (
        <li key={source.id} className="flex items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{t(LABEL_KEY[source.id])}</span>
          <span className="w-8 shrink-0 text-right tabular-nums text-muted-foreground">
            {counts[source.id] ?? 0}
          </span>
          <button
            type="button"
            title={`${t(LABEL_KEY[source.id])} · /${slug}?s=${source.id}`}
            onClick={() => copy(source.id)}
            className="shrink-0 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {copied === source.id ? t("sourcesCopied") : t("sourcesCopy")}
          </button>
        </li>
      ))}
      <li className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="min-w-0 flex-1 truncate">{t("sourceUntagged")}</span>
        <span className="w-8 shrink-0 text-right tabular-nums">{untagged}</span>
      </li>
    </ul>
  );
}
