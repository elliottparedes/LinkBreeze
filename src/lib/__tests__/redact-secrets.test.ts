import { describe, expect, it } from "vitest";
import {
  redactSecrets,
  stripSensitiveSearchParams,
} from "@/lib/redact-secrets";

describe("redactSecrets", () => {
  it("redacts password query params in request log lines", () => {
    const line =
      "GET /login?username=testuser&password=TestPass1 200 in 40ms";
    expect(redactSecrets(line)).toBe(
      "GET /login?username=testuser&password=[REDACTED] 200 in 40ms",
    );
  });

  it("redacts setup wizard GET fallbacks", () => {
    const line =
      "GET /setup?username=elliott&password=Secret1%21 200 in 64ms";
    expect(redactSecrets(line)).toContain("password=[REDACTED]");
    expect(redactSecrets(line)).not.toContain("Secret1");
  });

  it("redacts TOTP pending token on /login/totp", () => {
    const line =
      "GET /login/totp?u=testuser&p=opaque-pending-token&from=%2Fdashboard 200";
    expect(redactSecrets(line)).toContain("p=[REDACTED]");
    expect(redactSecrets(line)).not.toContain("opaque-pending-token");
  });

  it("redacts JSON password fields", () => {
    expect(redactSecrets('body {"password":"hunter2"}')).toBe(
      'body {"password":"[REDACTED]"}',
    );
  });
});

describe("stripSensitiveSearchParams", () => {
  it("removes credential params and keeps username", () => {
    const params = new URLSearchParams(
      "username=testuser&password=TestPass1&from=%2Fdashboard",
    );
    expect(stripSensitiveSearchParams(params)).toBe(true);
    expect(params.get("username")).toBe("testuser");
    expect(params.get("from")).toBe("/dashboard");
    expect(params.has("password")).toBe(false);
  });

  it("returns false when nothing sensitive is present", () => {
    const params = new URLSearchParams("username=testuser");
    expect(stripSensitiveSearchParams(params)).toBe(false);
  });
});
