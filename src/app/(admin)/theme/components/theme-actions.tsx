"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownUp,
  Download,
  Upload,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SuccessToast } from "@/components/ui/success-toast";
import type { ThemeRow } from "@/server/queries";

/** Import and export controls for the instance admin's theme gallery. */
export function ThemeActions({
  themes,
  active,
}: {
  themes: ThemeRow[];
  active: ThemeRow | null;
}) {
  const t = useTranslations("theme");
  const router = useRouter();

  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [impBusy, setImpBusy] = React.useState(false);
  const [impError, setImpError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleExport = (id: number) => {
    // Anchor click so the browser honors the API route's filename header.
    const a = document.createElement("a");
    a.href = `/api/themes/export?id=${id}`;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleImportClick = () => {
    setImpError(null);
    inputRef.current?.click();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so picking the same file twice still fires onChange.
    e.target.value = "";
    if (!file) return;

    setImpBusy(true);
    setImpError(null);
    try {
      const text = await file.text();
      const res = await fetch("/api/themes/import", {
        method: "POST",
        body: text,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || `Import failed (HTTP ${res.status})`);
      }
      setToast("Theme imported");
      router.refresh();
    } catch (err) {
      setImpError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImpBusy(false);
    }
  };

  // ── Toast ─────────────────────────────────────────────────────────────
  const [toast, setToast] = React.useState<string | null>(null);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setImpError(null);
          setToolsOpen(true);
        }}
      >
        <ArrowDownUp className="size-3.5" />{t("importAmpExport")}
      </Button>

      {/* Import & export dialog */}
      <Dialog open={toolsOpen} onOpenChange={setToolsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("importExport")}</DialogTitle>
            <DialogDescription>{t("downloadAThemeAsAJsonFileToBackItUpOrSha")}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <span className="text-xs font-medium text-muted-foreground">{t("export")}</span>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-border">
              {themes.map((t, i) => (
                <React.Fragment key={t.id}>
                  {i > 0 ? <Separator className="!h-px" /> : null}
                  <button
                    type="button"
                    onClick={() => handleExport(t.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                  >
                    <span
                      aria-hidden
                      className="size-3.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                      style={{
                        background:
                          t.backgroundValue?.split(",")[0]?.trim() ||
                          t.primaryColor ||
                          "#7c5ff0",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {t.name}
                      {active && t.id === active.id ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (current)
                        </span>
                      ) : null}
                    </span>
                    <Download className="size-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </React.Fragment>
              ))}
            </div>

            <span className="mt-1 text-xs font-medium text-muted-foreground">{t("import")}</span>
            <input
              ref={inputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleImportClick}
              disabled={impBusy}
            >
              <Upload className="size-3.5" />
              {impBusy ? t("importing") : t("chooseJsonFile")}
            </Button>
            {impError ? (
              <p className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="size-3.5" />
                {impError}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {toast ? (
        <SuccessToast message={toast} onDismiss={() => setToast(null)} />
      ) : null}
    </>
  );
}
