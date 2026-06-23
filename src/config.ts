import { z } from 'zod'

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8722),
  HEARTWOOD_TOKEN: z.string().min(1),
  DB_PATH: z.string().min(1).default('./heartwood.db'),
})

export interface HeartwoodConfig {
  port: number
  token: string
  dbPath: string
}

/**
 * Validates the environment and returns the typed config. Fails fast and loud when the
 * auth token is missing, so the server never starts unauthenticated by accident.
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): HeartwoodConfig => {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`invalid configuration: ${issues}`)
  }
  return {
    port: parsed.data.PORT,
    token: parsed.data.HEARTWOOD_TOKEN,
    dbPath: parsed.data.DB_PATH,
  }
}
