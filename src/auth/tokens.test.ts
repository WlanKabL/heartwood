import { describe, it, expect } from 'vitest'
import { generateToken, hashToken, resolveToken } from './tokens.js'
import { setupPostgresTests, getDb, getUserA } from '../storage/postgres-test-setup.js'
import { apiTokens } from '../storage/schema.js'

// ── Pure-function tests (no DB) ───────────────────────────────────────────────

describe('generateToken', () => {
  it('generates a hw_-prefixed token and a stable hash', () => {
    const t = generateToken()
    expect(t.raw.startsWith('hw_')).toBe(true)
    expect(t.prefix).toBe(t.raw.slice(0, 11))
    expect(hashToken(t.raw)).toBe(t.hash)
  })

  it('hash is deterministic and differs per token', () => {
    expect(hashToken('hw_x')).toBe(hashToken('hw_x'))
    expect(generateToken().hash).not.toBe(generateToken().hash)
  })
})

// ── Postgres-backed resolver tests ────────────────────────────────────────────

setupPostgresTests()

describe('resolveToken', () => {
  it('returns the userId and sets lastUsedAt when the token is valid', async () => {
    const db = getDb()
    const userId = getUserA()
    const token = generateToken()

    await db.insert(apiTokens).values({
      userId,
      name: 'test-token',
      tokenHash: token.hash,
      prefix: token.prefix,
    })

    const before = new Date()
    const resolved = await resolveToken(db, `Bearer ${token.raw}`)
    expect(resolved).toBe(userId)

    // Verify lastUsedAt was written and is a recent timestamp.
    const [row] = await db
      .select({ lastUsedAt: apiTokens.lastUsedAt })
      .from(apiTokens)
      .where(
        (await import('drizzle-orm')).eq(apiTokens.tokenHash, token.hash),
      )
    expect(row?.lastUsedAt).not.toBeNull()
    expect(row?.lastUsedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  it('returns null for a garbage token', async () => {
    const resolved = await resolveToken(getDb(), 'Bearer hw_notavalidtoken')
    expect(resolved).toBeNull()
  })

  it('returns null when the Authorization header is absent', async () => {
    const resolved = await resolveToken(getDb(), undefined)
    expect(resolved).toBeNull()
  })

  it('does not return a token belonging to a different hash', async () => {
    const db = getDb()
    const userId = getUserA()
    const token = generateToken()

    await db.insert(apiTokens).values({
      userId,
      name: 'test-token',
      tokenHash: token.hash,
      prefix: token.prefix,
    })

    // Use a different raw token whose hash will not match.
    const other = generateToken()
    const resolved = await resolveToken(db, `Bearer ${other.raw}`)
    expect(resolved).toBeNull()
  })
})
