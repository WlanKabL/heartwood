import { describe, it, expect } from 'vitest'
import { findOrCreateGithubUser } from './users.js'
import { setupPostgresTests, getDb } from '../storage/postgres-test-setup.js'
import { identities, users } from '../storage/schema.js'
import { eq, and } from 'drizzle-orm'

setupPostgresTests()

describe('findOrCreateGithubUser', () => {
  it('creates a user and identity on first call', async () => {
    const db = getDb()
    const profile = { githubId: 'gh-111', email: 'alice@example.com', displayName: 'Alice' }

    const userId = await findOrCreateGithubUser(db, profile)
    expect(typeof userId).toBe('string')
    expect(userId.length).toBeGreaterThan(0)

    // Verify the identity row exists with the expected fields.
    const [identity] = await db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'github'), eq(identities.providerAccountId, 'gh-111')))

    expect(identity).toBeDefined()
    expect(identity?.userId).toBe(userId)

    // Verify the users row exists with the expected fields.
    const [user] = await db.select().from(users).where(eq(users.id, userId))
    expect(user?.email).toBe('alice@example.com')
    expect(user?.displayName).toBe('Alice')
  })

  it('returns the SAME userId on a second call with the same githubId (idempotent)', async () => {
    const db = getDb()
    const profile = { githubId: 'gh-222', email: 'bob@example.com', displayName: 'Bob' }

    const firstId = await findOrCreateGithubUser(db, profile)
    const secondId = await findOrCreateGithubUser(db, profile)

    expect(secondId).toBe(firstId)

    // Only one identity row should exist.
    const rows = await db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'github'), eq(identities.providerAccountId, 'gh-222')))

    expect(rows).toHaveLength(1)
  })

  it('creates distinct users for distinct githubIds', async () => {
    const db = getDb()

    const idA = await findOrCreateGithubUser(db, {
      githubId: 'gh-333',
      email: 'carol@example.com',
      displayName: null,
    })
    const idB = await findOrCreateGithubUser(db, {
      githubId: 'gh-444',
      email: 'dave@example.com',
      displayName: null,
    })

    expect(idA).not.toBe(idB)
  })

  it('creates two distinct users when different githubIds share the same email', async () => {
    const db = getDb()

    // Two completely different GitHub accounts whose primary email happens to be identical.
    const idA = await findOrCreateGithubUser(db, {
      githubId: 'gh-555',
      email: 'shared@example.com',
      displayName: 'Account One',
    })
    const idB = await findOrCreateGithubUser(db, {
      githubId: 'gh-666',
      email: 'shared@example.com',
      displayName: 'Account Two',
    })

    // Must not throw and must produce two distinct user rows.
    expect(typeof idA).toBe('string')
    expect(typeof idB).toBe('string')
    expect(idA).not.toBe(idB)

    // Both identities must exist.
    const rowA = await db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'github'), eq(identities.providerAccountId, 'gh-555')))
    const rowB = await db
      .select()
      .from(identities)
      .where(and(eq(identities.provider, 'github'), eq(identities.providerAccountId, 'gh-666')))

    expect(rowA).toHaveLength(1)
    expect(rowB).toHaveLength(1)
    expect(rowA[0]?.userId).toBe(idA)
    expect(rowB[0]?.userId).toBe(idB)
  })
})
