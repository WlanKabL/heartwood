import { z } from 'zod'

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8722),
  DATABASE_URL: z.string().url(),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  PUBLIC_URL: z.string().url(),
})

export interface HeartwoodConfig {
  port: number
  databaseUrl: string
  github: { clientId: string; clientSecret: string }
  sessionSecret: string
  publicUrl: string
}

/**
 * Validates the environment and returns the typed config. Fails fast and loud when required
 * vars are missing, so the server never starts in a broken state.
 */
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): HeartwoodConfig => {
  const parsed = ConfigSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
    throw new Error(`invalid configuration: ${issues}`)
  }
  return {
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    github: {
      clientId: parsed.data.GITHUB_CLIENT_ID,
      clientSecret: parsed.data.GITHUB_CLIENT_SECRET,
    },
    sessionSecret: parsed.data.SESSION_SECRET,
    publicUrl: parsed.data.PUBLIC_URL,
  }
}
