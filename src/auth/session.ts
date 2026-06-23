import type { FastifyRequest, FastifyReply } from 'fastify'

// Extend @fastify/secure-session's SessionData so the typed get/set
// overloads accept 'userId' without falling through to `key: never`.
declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string
  }
}

/** Stores a userId in the secure session cookie. */
export const setUserSession = (reply: FastifyReply, userId: string): void => {
  reply.request.session.set('userId', userId)
}

/** Reads the userId from the session, or null if the session is absent/expired. */
export const getUserSession = (request: FastifyRequest): string | null => {
  const value = request.session.get('userId')
  return value ?? null
}

/** Deletes the session (logs the user out). */
export const clearSession = (reply: FastifyReply): void => {
  reply.request.session.delete()
}
