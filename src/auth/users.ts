import { eq, and } from 'drizzle-orm'
import type { Db } from '../storage/db.js'
import { users, identities } from '../storage/schema.js'

export interface GithubProfile {
  githubId: string
  email: string
  displayName: string | null
}

/**
 * Finds or creates a user+identity row for a GitHub OAuth login.
 *
 * Idempotent: a second call with the same githubId returns the same userId
 * without creating any duplicates. Runs inside a transaction so the insert
 * pair is atomic.
 */
export const findOrCreateGithubUser = async (db: Db, profile: GithubProfile): Promise<string> => {
  // Fast path: identity already exists.
  const [existing] = await db
    .select({ userId: identities.userId })
    .from(identities)
    .where(and(eq(identities.provider, 'github'), eq(identities.providerAccountId, profile.githubId)))

  if (existing) return existing.userId

  // Slow path: create user + identity atomically.
  return db.transaction(async (tx) => {
    // Re-check inside the transaction to guard against a race between two
    // simultaneous first-logins for the same GitHub account.
    const [raceCheck] = await tx
      .select({ userId: identities.userId })
      .from(identities)
      .where(and(eq(identities.provider, 'github'), eq(identities.providerAccountId, profile.githubId)))

    if (raceCheck) return raceCheck.userId

    const [newUser] = await tx
      .insert(users)
      .values({ email: profile.email, displayName: profile.displayName })
      .returning({ id: users.id })

    if (!newUser) throw new Error('failed to insert user')

    await tx.insert(identities).values({
      userId: newUser.id,
      provider: 'github',
      providerAccountId: profile.githubId,
    })

    return newUser.id
  })
}
