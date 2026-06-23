import { beforeAll, beforeEach, afterAll } from 'vitest'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './db.js'
import { users } from './schema.js'
import type { Db } from './db.js'
import pg from 'pg'

const TEST_DATABASE_URL =
  process.env['TEST_DATABASE_URL'] ?? 'postgres://heartwood:heartwood@localhost:5432/heartwood_test'

// Module-level singletons: shared across all test files that call setupPostgresTests().
// Initialised once by the first beforeAll that runs; subsequent beforeAll calls are no-ops.
let _db: Db | undefined
let _pool: pg.Pool | undefined
let _userA: string = ''
let _userB: string = ''
let _migrated = false

export const getDb = (): Db => {
  if (!_db) throw new Error('Postgres db not initialised — call setupPostgresTests() first')
  return _db
}
export const getUserA = (): string => _userA
export const getUserB = (): string => _userB

const truncateAll = async (pool: pg.Pool): Promise<void> => {
  await pool.query(
    'TRUNCATE TABLE nodes, workflows, api_tokens, identities, users RESTART IDENTITY CASCADE',
  )
}

const seedUsers = async (): Promise<{ userA: string; userB: string }> => {
  if (!_db) throw new Error('db not ready')
  const [a, b] = await _db
    .insert(users)
    .values([{ email: 'a@test' }, { email: 'b@test' }])
    .returning({ id: users.id })

  if (!a || !b) throw new Error('Failed to seed test users')
  return { userA: a.id, userB: b.id }
}

export const setupPostgresTests = (): void => {
  beforeAll(async () => {
    // Guard: only initialise once, even if multiple test files call this function.
    if (!_pool) {
      const created = createDb(TEST_DATABASE_URL)
      _db = created.db
      _pool = created.pool
    }

    if (!_migrated) {
      try {
        await migrate(_db!, { migrationsFolder: './migrations' })
      } catch (err) {
        // Drizzle creates the "drizzle" schema unconditionally.
        // If it already exists (subsequent test runs), swallow that specific error.
        const cause = err instanceof Error ? (err.cause as { code?: string } | undefined) : undefined
        if (cause?.code !== '42P06') throw err
      }
      _migrated = true
    }

    // Clean slate before the first test in this file, then seed fresh users.
    await truncateAll(_pool!)
    const ids = await seedUsers()
    _userA = ids.userA
    _userB = ids.userB
  })

  beforeEach(async () => {
    await truncateAll(_pool!)
    const ids = await seedUsers()
    _userA = ids.userA
    _userB = ids.userB
  })

  afterAll(async () => {
    // Only end the pool after the last file's afterAll. Since we can't know which is
    // last, we leave the pool open; the process exits cleanly after all tests finish.
    // Vitest worker teardown handles the underlying connection cleanup.
  })
}
