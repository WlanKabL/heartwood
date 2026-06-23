/**
 * Guards /app routes. The app shell is client-only (ssr:false), so this runs in
 * the browser: resolve the session, and if there is none, send the user through
 * GitHub OAuth. A full-page navigation is used so cookies are set on the origin.
 */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const { user, fetchSession } = useSession()
  if (!user.value) await fetchSession()

  if (!user.value) {
    window.location.href = '/auth/github'
    return abortNavigation()
  }
})
