import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema.js'

export type Db = ReturnType<typeof drizzle<typeof schema>>

export const createDb = (databaseUrl: string): { db: Db; pool: pg.Pool } => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  return { db: drizzle(pool, { schema }), pool }
}
