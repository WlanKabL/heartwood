import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from '../storage/db.js'

const url = process.env['DATABASE_URL']
if (!url) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { db, pool } = createDb(url)
try {
  await migrate(db, { migrationsFolder: './migrations' })
  console.log('migrations applied')
} catch (err) {
  console.error('migration failed:', err)
  process.exitCode = 1
} finally {
  await pool.end()
}
