import { randomBytes, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Db } from '../storage/db.js'
import { apiTokens } from '../storage/schema.js'
import { extractBearer } from '../http/auth.js'

const PREFIX = 'hw_'

export const hashToken = (raw: string): string =>
  createHash('sha256').update(raw).digest('hex')

export const generateToken = (): { raw: string; hash: string; prefix: string } => {
  const raw = PREFIX + randomBytes(32).toString('base64url')
  return { raw, hash: hashToken(raw), prefix: raw.slice(0, 11) }
}

/**
 * Resolves a raw bearer token from an Authorization header to the owning userId.
 *
 * - Returns the userId on a successful lookup and updates lastUsedAt.
 * - Returns null if the header is absent, malformed, or the hash is not found.
 */
export const resolveToken = async (
  db: Db,
  authHeader: string | undefined,
  now: () => Date = () => new Date(),
): Promise<string | null> => {
  const raw = extractBearer(authHeader)
  if (raw === null) return null

  const hash = hashToken(raw)

  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId })
    .from(apiTokens)
    .where(eq(apiTokens.tokenHash, hash))

  if (!row) return null

  await db
    .update(apiTokens)
    .set({ lastUsedAt: now() })
    .where(eq(apiTokens.id, row.id))

  return row.userId
}
