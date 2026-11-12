/**
 * Keep credentials out of terminal / process logs.
 *
 * Next.js dev request logging prints the raw URL (so a GET fallback like
 * `/login?password=…` would leak), and server-action logging can stringify
 * FormData. These helpers redact known secret query/body shapes before
 * anything hits stdout/stderr.
 */

/** Query / form field names that must never appear in cleartext logs. */
export const SENSITIVE_PARAM_NAMES = [
  "password",
  "passwd",
  "pwd",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "secret",
  "token",
  "pending",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "authorization",
] as const;

const SENSITIVE_NAME_SET = new Set<string>(SENSITIVE_PARAM_NAMES);

const SENSITIVE_QUERY_RE = new RegExp(
  `([?&](?:${SENSITIVE_PARAM_NAMES.join("|")})=)([^&#\\s]*)`,
  "gi",
);

const SENSITIVE_JSON_RE = new RegExp(
  `("(?:${SENSITIVE_PARAM_NAMES.join("|")})"\\s*:\\s*")([^"]*)`,
  "gi",
);

// TOTP handoff puts the pending token in `?p=` on /login/totp only.
const TOTP_PENDING_RE = /(\/login\/totp\?[^\s]*?[?&]p=)([^&#\s]*)/gi;

/** Replace secret values in a free-form log string. */
export function redactSecrets(text: string): string {
  return text
    .replace(SENSITIVE_QUERY_RE, "$1[REDACTED]")
    .replace(TOTP_PENDING_RE, "$1[REDACTED]")
    .replace(SENSITIVE_JSON_RE, "$1[REDACTED]");
}

/**
 * Drop credential query params from a URLSearchParams clone.
 * Returns true when anything was removed.
 *
 * Does not strip short opaque params like `p` (TOTP pending) — those must
 * stay in the live URL so the 2FA handoff still works; log redaction covers
 * them separately.
 */
export function stripSensitiveSearchParams(params: URLSearchParams): boolean {
  let removed = false;
  for (const key of [...params.keys()]) {
    if (SENSITIVE_NAME_SET.has(key.toLowerCase())) {
      params.delete(key);
      removed = true;
    }
  }
  return removed;
}

let installed = false;

/**
 * Patch process stdio + console so Next.js request lines cannot print
 * cleartext passwords. Safe to call multiple times.
 */
export function installLogRedaction(): void {
  if (installed || typeof process === "undefined") return;
  installed = true;

  const wrapWrite = (stream: NodeJS.WriteStream) => {
    const original = stream.write.bind(stream);
    stream.write = ((
      chunk: string | Uint8Array,
      encoding?: BufferEncoding | ((err?: Error | null) => void),
      cb?: (err?: Error | null) => void,
    ) => {
      if (typeof chunk === "string") {
        return original(redactSecrets(chunk), encoding as BufferEncoding, cb);
      }
      if (chunk instanceof Uint8Array) {
        const text = Buffer.from(chunk).toString(
          typeof encoding === "string" ? encoding : "utf8",
        );
        return original(redactSecrets(text), encoding as BufferEncoding, cb);
      }
      return original(chunk as never, encoding as never, cb);
    }) as typeof stream.write;
  };

  wrapWrite(process.stdout);
  wrapWrite(process.stderr);

  for (const method of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      original(
        ...args.map((arg) =>
          typeof arg === "string" ? redactSecrets(arg) : arg,
        ),
      );
    };
  }
}
