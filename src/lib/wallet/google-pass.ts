import * as crypto from "node:crypto";

/**
 * Google Wallet "Generic pass" builder — pure module, no DB.
 *
 * BYO credentials: the operator provides GOOGLE_WALLET_ISSUER_ID and
 * GOOGLE_WALLET_SERVICE_ACCOUNT_JSON (service-account key with the Wallet
 * API enabled). The pass is issued JUST-IN-TIME: class + object JSON is
 * embedded in an RS256-signed JWT and the save link points at
 * https://pay.google.com/gp/v/save/{jwt} — Google creates everything when
 * the link is clicked. Stateless: no DB tables, no callbacks.
 *
 * Notes:
 * - RS256 signing via node:crypto (~20 lines) instead of a JWT dependency.
 * - The JWT lives in the URL: keep the payload compact. The logo must be a
 *   PUBLIC https URL (Google fetches it), so only externally reachable
 *   profile images can be used.
 * - Issuer accounts start in DEMO mode: saves only work for whitelisted
 *   test users until Google approves production access.
 */

export interface GoogleWalletCreds {
  issuerId: string;
  clientEmail: string;
  privateKey: string; // PKCS#8 PEM from the service-account JSON
}

export interface GooglePassInput {
  slug: string;
  title: string;
  origin: string;
  /** Optional externally-hosted logo URL (https). Skipped when absent. */
  logoUrl?: string | null;
  /** Theme colors as #rrggbb — Google accepts hex strings. */
  backgroundColor?: string | null;
  /** Top active links snapshot for the back of the pass. */
  links: Array<{ title: string; url: string }>;
  /** ISO date when the pass was generated (staleness label). */
  savedOn: string;
}

/**
 * Parse + validate the raw service-account JSON env value. The issuer ID is
 * NOT in the JSON — it comes separately from GOOGLE_WALLET_ISSUER_ID, so
 * `raw` is valid but incomplete without `issuerId`.
 */
export function parseGoogleCreds(
  raw: string | undefined,
  issuerId: string | undefined,
): GoogleWalletCreds | null {
  if (!issuerId || !/^\d{10,20}$/.test(issuerId.trim())) return null;
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) return null;
    // Service-account JSON stores PEM with literal \n escapes — restore them.
    const key = parsed.private_key.replace(/\\n/g, "\n");
    if (!key.includes("-----BEGIN")) return null;
    return { issuerId: issuerId.trim(), clientEmail: parsed.client_email, privateKey: key };
  } catch {
    return null;
  }
}

/** Build the full save URL. Returns null when creds are absent — callers hide the button. */
export function buildGoogleSaveUrl(
  creds: GoogleWalletCreds | null,
  input: GooglePassInput,
): string | null {
  if (!creds) return null;
  const payload = buildJwtPayload(creds, input);
  const jwt = signJwt(payload, creds);
  return `https://pay.google.com/gp/v/save/${jwt}`;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function normalizeHex(c?: string | null): string | undefined {
  if (!c) return undefined;
  const m = /^#?([0-9a-fA-F]{6})$/.exec(c.trim());
  return m ? `#${m[1]}` : undefined;
}

function buildJwtPayload(
  creds: GoogleWalletCreds,
  input: GooglePassInput,
): Record<string, unknown> {
  // Keep existing Wallet IDs for flat slugs. Nested paths need an
  // unambiguous ID without '/', which Google Wallet does not permit.
  const walletSlug = input.slug.includes("/")
    ? `nested.${crypto.createHash("sha256").update(input.slug).digest("hex")}`
    : input.slug;
  const classId = `${creds.issuerId}.linkbreeze_${walletSlug}`;
  const objectId = `${creds.issuerId}.linkbreeze_${walletSlug}_card`;

  const textModulesData = [
    ...input.links.map((l) => ({ header: l.title, body: l.url })),
    { header: "Saved on", body: input.savedOn },
  ];

  const linksModuleData = {
    uris: input.links.map((l) => ({
      uri: l.url,
      description: l.title,
      id: "link",
    })),
  };

  return {
    iss: creds.clientEmail,
    aud: "google",
    typ: "savetowallet",
    iat: Math.floor(Date.now() / 1000),
    payload: {
      genericClasses: [{ id: classId }],
      genericObjects: [
        {
          id: objectId,
          classId,
          genericType: "GENERIC_TYPE_UNSPECIFIED",
          cardTitle: { defaultValue: { language: "en", value: input.title } },
          subheader: { defaultValue: { language: "en", value: input.slug } },
          logo:
            input.logoUrl && input.logoUrl.startsWith("https://")
              ? {
                  sourceUri: { uri: input.logoUrl },
                  contentDescription: {
                    defaultValue: { language: "en", value: input.title },
                  },
                }
              : undefined,
          hexBackgroundColor: normalizeHex(input.backgroundColor) || "#1a1a2e",
          barcode: {
            type: "QR_CODE",
            value: `${input.origin}/${input.slug}`,
            alternateText: `${input.slug} page`,
          },
          textModulesData,
          linksModuleData,
        },
      ],
    },
  };
}

function signJwt(
  claims: Record<string, unknown>,
  creds: GoogleWalletCreds,
): string {
  const header = { alg: "RS256", typ: "JWT" };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(claims),
  )}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), {
    key: creds.privateKey,
  });
  return `${signingInput}.${b64url(signature)}`;
}
