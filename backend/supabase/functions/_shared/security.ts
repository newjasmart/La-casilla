const encoder = new TextEncoder();

export function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export const escapeHtmlAttribute = escapeHtml;

export function safeHeaderText(value: unknown): string {
  return String(value).replace(/[\r\n]+/g, " ").trim();
}

export function stableStringify(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function saltedHash(secret: string, purpose: string, value: string): Promise<string> {
  const bytes = encoder.encode(`${purpose}\0${secret}\0${value}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requestClientIdentifier(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || forwarded
    || "unknown";
}

export function validateIdempotencyKey(request: Request): string | null {
  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || !/^[A-Za-z0-9._:-]{8,200}$/.test(key)) return null;
  return key;
}
