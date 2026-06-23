import type { FastifyInstance, FastifyReply } from 'fastify'
import type { OAuth2Namespace, ProviderConfiguration } from '@fastify/oauth2'
import oauthPlugin from '@fastify/oauth2'

/**
 * GitHub OAuth2 endpoints.
 * Mirrors fastifyOauth2.GITHUB_CONFIGURATION — hardcoded to avoid the CJS
 * static-property resolution issue when importing an `export =` module.
 */
const GITHUB_CONFIGURATION: ProviderConfiguration = {
  tokenHost: 'https://github.com',
  tokenPath: '/login/oauth/access_token',
  authorizePath: '/login/oauth/authorize',
}
import type { GithubProfile } from '../auth/users.js'
import { findOrCreateGithubUser } from '../auth/users.js'
import { setUserSession, clearSession } from '../auth/session.js'
import type { Db } from '../storage/db.js'

export interface AuthRouteDeps {
  db: Db
  github: { clientId: string; clientSecret: string }
  publicUrl: string
}

interface GithubUserResponse {
  id: number
  login: string
  name: string | null
  email: string | null
}

interface GithubEmailEntry {
  email: string
  primary: boolean
  verified: boolean
}

/** FastifyInstance with the githubOAuth2 namespace mounted by @fastify/oauth2. */
interface AppWithGithubOAuth {
  githubOAuth2: OAuth2Namespace
}

/**
 * Fetches the GitHub user profile (and primary email if the /user endpoint
 * returns null for email) using the provided access token.
 */
const fetchGithubProfile = async (accessToken: string): Promise<GithubProfile> => {
  const headers = {
    authorization: `Bearer ${accessToken}`,
    'user-agent': 'heartwood/1.0',
    accept: 'application/json',
  }

  const userRes = await fetch('https://api.github.com/user', { headers })
  if (!userRes.ok) throw new Error(`GitHub /user returned ${userRes.status}`)

  const user = (await userRes.json()) as GithubUserResponse

  let email = user.email
  if (!email) {
    // Private email: fetch the verified primary from /user/emails.
    const emailsRes = await fetch('https://api.github.com/user/emails', { headers })
    if (emailsRes.ok) {
      const emails = (await emailsRes.json()) as GithubEmailEntry[]
      const primary = emails.find((e) => e.primary && e.verified)
      email = primary?.email ?? null
    }
  }

  if (!email) throw new Error('GitHub account has no accessible verified email')

  return {
    githubId: String(user.id),
    email,
    displayName: user.name,
  }
}

/**
 * Testable core of the GitHub OAuth callback: given a resolved profile,
 * find-or-create the user, set the session, and redirect to /.
 *
 * Separated from the route handler so the GitHub HTTP round-trips (access-token
 * exchange, /user fetch) can be skipped in tests.
 */
export const completeGithubLogin = async (
  db: Db,
  reply: FastifyReply,
  profile: GithubProfile,
): Promise<void> => {
  const userId = await findOrCreateGithubUser(db, profile)
  setUserSession(reply, userId)
  await reply.redirect('/')
}

/**
 * Registers the GitHub OAuth redirect, callback, and logout routes.
 * Call this once inside buildServer.
 */
export const registerAuthRoutes = (app: FastifyInstance, deps: AuthRouteDeps): void => {
  app.register(oauthPlugin, {
    name: 'githubOAuth2',
    scope: ['user:email'],
    credentials: {
      client: {
        id: deps.github.clientId,
        secret: deps.github.clientSecret,
      },
      auth: GITHUB_CONFIGURATION,
    },
    startRedirectPath: '/auth/github',
    callbackUri: `${deps.publicUrl}/auth/github/callback`,
  })

  app.get('/auth/github/callback', async (request, reply) => {
    const { githubOAuth2 } = app as FastifyInstance & AppWithGithubOAuth
    const tokenResult = await githubOAuth2.getAccessTokenFromAuthorizationCodeFlow(request, reply)
    const accessToken = tokenResult.token.access_token

    const profile = await fetchGithubProfile(accessToken)
    await completeGithubLogin(deps.db, reply, profile)
    return reply
  })

  app.post('/auth/logout', async (_request, reply) => {
    clearSession(reply)
    return reply.redirect('/')
  })
}
