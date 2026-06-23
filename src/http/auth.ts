import { timingSafeEqual } from 'node:crypto'

/** Extracts the token from an `Authorization: Bearer <token>` header, or null. */
export const extractBearer = (header: string | undefined): string | null => {
  if (header === undefined) return null
  const match = /^Bearer (.+)$/.exec(header)
  return match ? match[1]! : null
}

/** Constant-time check of a bearer header against the expected token. */
export const isAuthorized = (header: string | undefined, expectedToken: string): boolean => {
  const provided = extractBearer(header)
  if (provided === null) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expectedToken)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
