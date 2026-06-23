export interface SessionUser {
  id: string
  email: string
  displayName: string | null
}

/**
 * The logged-in user, resolved from the session cookie via GET /api/me.
 * Shared across the app through Nuxt's useState so one fetch serves every page.
 */
export const useSession = () => {
  const user = useState<SessionUser | null>('session-user', () => null)

  const fetchSession = async (): Promise<SessionUser | null> => {
    try {
      user.value = await $fetch<SessionUser>('/api/me')
    } catch {
      user.value = null
    }
    return user.value
  }

  const signOut = async (): Promise<void> => {
    await $fetch('/auth/logout', { method: 'POST' }).catch(() => undefined)
    user.value = null
    window.location.href = '/'
  }

  return { user, fetchSession, signOut }
}
