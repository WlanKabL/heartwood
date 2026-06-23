/** Extracts the token from an `Authorization: Bearer <token>` header, or null. */
export const extractBearer = (header: string | undefined): string | null => {
  if (header === undefined) return null
  const match = /^Bearer (.+)$/.exec(header)
  return match ? match[1]! : null
}
