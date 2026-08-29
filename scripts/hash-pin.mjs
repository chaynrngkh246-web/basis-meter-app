// Prints the SHA-256 hash for a PIN, so you can create the very first
// technician by hand in the Firebase console (before anyone can log in
// to the app itself and use the Settings page to add technicians).
//
// Usage: node scripts/hash-pin.mjs 1234
import { createHash } from 'node:crypto'

const pin = process.argv[2]
if (!pin || !/^\d{4}$/.test(pin)) {
  console.error('Usage: node scripts/hash-pin.mjs 1234')
  process.exit(1)
}

console.log(createHash('sha256').update(pin).digest('hex'))
