import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Public signup: Member role, own page, closed by default, reserved slugs
 * rejected, and a per-IP rate limit.
 */

const mocks = vi.hoisted(() => ({
  ip: "203.0.113.10",
  demoGuard: vi.fn((): null => null),
  hashPassword: vi.fn(async (s: string) => `hashed-${s}`),
  createSession: vi.fn(async () => undefined),
  revalidatePath: vi.fn(),
  getUserCount: vi.fn(async () => 1),
  getUserByUsername: vi.fn(async (): Promise<{ id: number } | null> => null),
  createUser: vi.fn(async () => ({ id: 9 })),
  provisionAccountPage: vi.fn(async () => undefined),
  getRoleByName: vi.fn(async () => ({ id: 2, name: "Member" })),
  getSetting: vi.fn(async (key: string): Promise<string | null> => {
    if (key === "publicSignup") return "on";
    return null;
  }),
  recordAudit: vi.fn(async () => undefined),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": mocks.ip }),
}));
vi.mock("@/lib/auth", () => ({
  hashPassword: mocks.hashPassword,
  createSession: mocks.createSession,
}));
vi.mock("@/lib/demo-guard", () => ({ demoGuard: mocks.demoGuard }));
vi.mock("@/server/audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/server/queries", () => ({
  getUserCount: mocks.getUserCount,
  getUserByUsername: mocks.getUserByUsername,
  createUser: mocks.createUser,
  provisionAccountPage: mocks.provisionAccountPage,
  getRoleByName: mocks.getRoleByName,
  getSetting: mocks.getSetting,
}));

import { signupAction } from "@/server/actions/signup";

function fd(username: string, password = "Password1"): FormData {
  const f = new FormData();
  f.set("username", username);
  f.set("password", password);
  return f;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  mocks.demoGuard.mockReturnValue(null);
  mocks.getUserCount.mockResolvedValue(1);
  mocks.getUserByUsername.mockResolvedValue(null);
  mocks.createUser.mockResolvedValue({ id: 9 });
  mocks.getRoleByName.mockResolvedValue({ id: 2, name: "Member" });
  mocks.getSetting.mockImplementation(async (key: string) => {
    if (key === "publicSignup") return "on";
    return null;
  });
});

describe("signupAction", () => {
  it("creates a Member, their page, and a session", async () => {
    const res = await signupAction(fd("alice"));
    expect(res.success).toBe(true);
    expect(mocks.createUser).toHaveBeenCalledWith("alice", "hashed-Password1", { roleId: 2 });
    expect(mocks.provisionAccountPage).toHaveBeenCalledWith(9, "alice");
    expect(mocks.createSession).toHaveBeenCalledWith(9, "alice");
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      "account.created",
      "alice",
      { via: "signup", roleId: 2 },
      expect.objectContaining({ actor: { userId: 9, username: "alice" } }),
    );
  });

  it("rejects a taken username", async () => {
    mocks.getUserByUsername.mockResolvedValue({ id: 3 });
    const res = await signupAction(fd("alice"));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe("conflict");
      expect(res.error).toBe("Username already taken");
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rejects a reserved slug", async () => {
    const res = await signupAction(fd("login"));
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.errorCode).toBe("validation");
      expect(res.error).toBe("This username is reserved");
    }
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("refuses when public signup is off", async () => {
    mocks.getSetting.mockResolvedValue(null);
    const res = await signupAction(fd("alice"));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("refuses before first-run setup", async () => {
    mocks.getUserCount.mockResolvedValue(0);
    const res = await signupAction(fd("alice"));
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("rate limits a burst from one IP", async () => {
    mocks.ip = "198.51.100.77";
    for (let i = 0; i < 5; i++) {
      const ok = await signupAction(fd(`user${i}`));
      expect(ok.success).toBe(true);
    }
    const blocked = await signupAction(fd("user6"));
    expect(blocked.success).toBe(false);
    if (!blocked.success) expect(blocked.errorCode).toBe("rate_limit");
    expect(mocks.createUser).toHaveBeenCalledTimes(5);
  });
});
