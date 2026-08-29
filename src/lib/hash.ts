// Simple SHA-256 hash for PINs using the browser's native SubtleCrypto.
// This is attribution, not a security boundary: it keeps PINs from sitting
// in Firestore as plain text, but this is an internal 8-person tool with
// open Firestore rules (see firestore.rules) — see README for the tradeoff.
export async function hashPin(pin: string): Promise<string> {
  const bytes = new TextEncoder().encode(pin)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
