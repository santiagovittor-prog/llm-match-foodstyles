// lib/sessions.ts

export interface DecodedSessionId {
  sheetId: string;
  tabName: string;
}

/**
 * Base64url-safe encode: no '+', '/', '=' so it's safe in URL path segments.
 */
function base64UrlEncode(input: string): string {
  const base64 = Buffer.from(input, "utf8").toString("base64");
  return base64
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, ""); // strip trailing '='
}

/**
 * Reverse of base64UrlEncode.
 */
function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  // pad with '=' to length multiple of 4
  const pad = 4 - (base64.length % 4);
  if (pad !== 4) {
    base64 += "=".repeat(pad);
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * Create a sessionId from sheetId + tabName.
 * We base64url-encode a small JSON payload so it’s safe in URLs.
 */
export function createSessionId(sheetId: string, tabName: string): string {
  const payload = JSON.stringify({ sheetId, tabName });
  return base64UrlEncode(payload);
}

/**
 * Reverse of createSessionId: turn sessionId back into { sheetId, tabName }.
 */
export function decodeSessionId(sessionId: string): DecodedSessionId {
  const json = base64UrlDecode(sessionId);
  const parsed = JSON.parse(json);

  if (!parsed.sheetId || !parsed.tabName) {
    throw new Error("Invalid sessionId payload");
  }

  return {
    sheetId: parsed.sheetId,
    tabName: parsed.tabName,
  };
}
