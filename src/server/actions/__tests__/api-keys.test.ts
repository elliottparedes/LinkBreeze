/**
 * #4 — API key server actions: auth required, demo mode blocks, plaintext
 * returned exactly once from generate, revoke delegates to the KV layer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
  requireInstanceAdmin: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/server/api-keys", () => ({
  createApiKey: mocks.createApiKey,
  revokeApiKey: mocks.revokeApiKey,
}));
vi.mock("@/server/access", () => ({ requireInstanceAdmin: mocks.requireInstanceAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { generateApiKeyAction, revokeApiKeyAction } from "@/server/actions/api-keys";

beforeEach(() => {
  mocks.requireInstanceAdmin.mockResolvedValue(null);
  mocks.createApiKey.mockResolvedValue({
    key: "lbk_plaintext-once",
    prefix: "lbk_plain1",
    createdAt: "2026-10-26T00:00:00.000Z",
  });
  mocks.revokeApiKey.mockResolvedValue(true);
});

afterEach(() => {
  delete process.env.DEMO_MODE;
  vi.clearAllMocks();
});

describe("generateApiKeyAction", () => {
  it("requires an instance admin", async () => {
    mocks.requireInstanceAdmin.mockResolvedValue({
      success: false,
      error: "Only instance admins can change instance settings",
      errorCode: "forbidden",
    });
    const res = await generateApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("forbidden");
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("is blocked in demo mode", async () => {
    process.env.DEMO_MODE = "true";
    const res = await generateApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("demo");
    expect(mocks.createApiKey).not.toHaveBeenCalled();
  });

  it("returns the plaintext key exactly once and revalidates settings", async () => {
    const res = await generateApiKeyAction();
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.key).toBe("lbk_plaintext-once");
      expect(res.prefix).toBe("lbk_plain1");
    }
    expect(mocks.createApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });
});

describe("revokeApiKeyAction", () => {
  it("requires an instance admin and blocks in demo mode", async () => {
    mocks.requireInstanceAdmin.mockResolvedValue({
      success: false,
      error: "Only instance admins can change instance settings",
      errorCode: "forbidden",
    });
    expect((await revokeApiKeyAction()).success).toBe(false);
    mocks.requireInstanceAdmin.mockResolvedValue(null);

    process.env.DEMO_MODE = "true";
    const res = await revokeApiKeyAction();
    expect(res.success).toBe(false);
    if (!res.success) expect(res.errorCode).toBe("demo");
    expect(mocks.revokeApiKey).not.toHaveBeenCalled();
  });

  it("revokes through the KV layer on success", async () => {
    const res = await revokeApiKeyAction();
    expect(res.success).toBe(true);
    expect(mocks.revokeApiKey).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });
});
