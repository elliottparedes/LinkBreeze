"use server";

import "server-only";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { createSession, hashPassword } from "@/lib/auth";
import { demoGuard } from "@/lib/demo-guard";
import {
  type ActionResult,
  ErrorCode,
  conflictError,
  forbiddenError,
  logError,
  validationError,
} from "@/lib/errors";
import { normalizeSlug, slugError } from "@/lib/link-slug";
import { rateLimit } from "@/lib/rate-limit";
import { recordAudit } from "@/server/audit";
import { accountPagePolicy, publicSignupEnabled, uniqueSlugForUsername } from "@/server/actions/accounts";
import {
  createPage,
  createUser,
  getRoleByName,
  getUserByUsername,
  getUserCount,
} from "@/server/queries";

const signupSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username must be at least 3 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "Username may only contain letters, numbers, dots, hyphens and underscores",
    ),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(256)
    .refine((v) => /[a-z]/.test(v), "Password must contain at least one lowercase letter")
    .refine((v) => /[A-Z]/.test(v), "Password must contain at least one uppercase letter")
    .refine((v) => /[0-9]/.test(v), "Password must contain at least one number"),
});

function clientIp(h: Headers): string {
  return (
    (h.get("x-forwarded-for")?.split(",")[0] || "").trim() ||
    (h.get("x-real-ip") || "").toString() ||
    "0.0.0.0"
  );
}

/**
 * Public sign-up. Creates a Member (never an admin), provisions their page
 * when the instance page policy is per-user, and signs them in.
 * Refuses unless an instance admin has turned publicSignup on, and unless
 * first-run setup has already created the operator account.
 */
export async function signupAction(formData: FormData): Promise<ActionResult> {
  const blocked = demoGuard();
  if (blocked) return blocked;

  if ((await getUserCount()) === 0 || !(await publicSignupEnabled())) {
    return forbiddenError("Sign-up is not open on this instance");
  }

  const h = await headers();
  const ip = clientIp(h);
  const rl = rateLimit(`signup:${ip}`, 5, 60_000);
  if (!rl.ok) {
    return {
      success: false,
      error: "Too many attempts — try again in a minute.",
      errorCode: ErrorCode.RATE_LIMIT,
    };
  }

  const parsed = signupSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return validationError(parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { username, password } = parsed.data;

  const slugBase = normalizeSlug(username);
  if (slugError(slugBase) === "reserved") {
    return validationError("This username is reserved");
  }

  if (await getUserByUsername(username)) {
    return conflictError("Username already taken");
  }

  const member = await getRoleByName("Member");

  try {
    const user = await createUser(
      username,
      await hashPassword(password),
      member ? { roleId: member.id } : {},
    );
    if ((await accountPagePolicy()) !== "manual") {
      await createPage({
        slug: await uniqueSlugForUsername(username),
        title: username,
        userId: user.id,
      });
    }
    await recordAudit(
      "account.created",
      username,
      { via: "signup", roleId: member?.id ?? null },
      { actor: { userId: user.id, username }, ip },
    );
    await createSession(user.id, username);
    revalidatePath("/dashboard");
    return { success: true };
  } catch (err) {
    logError("signup", err, { username });
    return {
      success: false,
      error: "Something went wrong. Please try again.",
      errorCode: ErrorCode.INTERNAL,
    };
  }
}
