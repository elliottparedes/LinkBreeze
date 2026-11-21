import { NextResponse } from "next/server";
import { PRODUCT_FILE_PREFIX } from "@/lib/brand";
import { requireInstanceAdmin } from "@/server/access";
import { getBackupPayload } from "@/server/backup-restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download the full config backup as JSON. Instance admins only. */
export async function GET() {
  const denied = await requireInstanceAdmin();
  if (denied) {
    return NextResponse.json({ error: denied.error }, { status: denied.errorCode === "unauthorized" ? 401 : 403 });
  }
  const payload = await getBackupPayload();
  const today = payload.exportedAt.slice(0, 10);
  return NextResponse.json(payload, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${PRODUCT_FILE_PREFIX}-backup-${today}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
