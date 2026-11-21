import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isReservedPageNamespace, PageSlugConflict } from "@/lib/page-path";
import { requireInstanceAdmin } from "@/server/access";
import {
  updateProfile as updateProfileQuery,
  updateSetting as updateSettingQuery,
  getDefaultPage,
  updatePage,
} from "@/server/queries";
import { setActiveTheme } from "@/server/queries";

const profileSchema = z.object({
  displayName: z.string().min(1).max(80),
  bio: z.string().max(300).optional().default(""),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z0-9_-]+$/, "Slug may only contain letters, numbers, hyphens and underscores")
    // Onboarding bypasses the pages-actions slug resolver, so enforce the
    // reserved-word blocklist here — slug "login" would otherwise make the
    // public page unreachable (ADMIN_RESERVED redirects it to /login).
    .refine((v) => !isReservedPageNamespace(v.toLowerCase()), "That slug is reserved")
    .transform((v) => v.toLowerCase()),
});

export async function POST(req: NextRequest) {
  const denied = await requireInstanceAdmin();
  if (denied) {
    return NextResponse.json(denied, { status: denied.errorCode === "unauthorized" ? 401 : 403 });
  }

  try {
    const body = await req.json();
    const parsed = profileSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }

    const { displayName, bio, slug } = parsed.data;

    const defaultPage = await getDefaultPage();
    await updatePage(defaultPage.id, { title: displayName, bio, slug });
    await updateProfileQuery({ displayName, bio });
    await updateSettingQuery("slug", slug);

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof PageSlugConflict) {
      return NextResponse.json({ success: false, error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { success: false, error: "Failed to save profile" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  const denied = await requireInstanceAdmin();
  if (denied) {
    return NextResponse.json(denied, { status: denied.errorCode === "unauthorized" ? 401 : 403 });
  }

  try {
    const body = await req.json();
    const { themeId } = body;

    if (typeof themeId !== "number") {
      return NextResponse.json(
        { success: false, error: "Invalid theme ID" },
        { status: 400 },
      );
    }

    await setActiveTheme(themeId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to set theme" },
      { status: 500 },
    );
  }
}
