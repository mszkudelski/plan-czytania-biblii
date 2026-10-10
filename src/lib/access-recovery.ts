const RECOVERY_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const RECOVERY_LENGTH = 32;

export function normalizeRecoveryCode(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 128) return null;
  const code = value.toUpperCase().replace(/[\s-]/g, "");
  return code.length === RECOVERY_LENGTH &&
    [...code].every((character) => RECOVERY_ALPHABET.includes(character))
    ? code
    : null;
}

export function generateRecoveryCode() {
  // The 32-character alphabet divides 256 evenly: 32 random bytes give
  // 160 bits of entropy without modulo bias.
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_LENGTH));
  return Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % 32]).join("");
}

export function formatRecoveryCode(code: string) {
  return code.match(/.{1,4}/g)?.join("-") ?? "";
}

export async function hashRecoveryCode(code: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256", new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
