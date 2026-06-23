import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-06-23',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  // Fixed dev port so it matches PUBLIC_URL; strictPort fails loudly instead of
  // silently moving to 3001 (which would break the OAuth callback + session cookie).
  devServer: { port: 3000 },
  vite: { plugins: [tailwindcss()], server: { strictPort: true } },
  app: {
    head: {
      htmlAttrs: { lang: 'en' },
      title: 'Heartwood — a truth engine for AI agents',
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,ital,wght@9..144,0,400;9..144,0,500;9..144,0,600;9..144,1,500&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
        },
      ],
      meta: [
        {
          name: 'description',
          content:
            'Heartwood stores what your project actually is as a hardened tree of truths and serves it to every AI agent.',
        },
      ],
    },
  },
  // Marketing routes are prerendered for SEO; the app shell is client-only.
  routeRules: {
    '/': { prerender: true },
    '/docs': { prerender: true },
    '/wiki': { prerender: true },
    '/app/**': { ssr: false },
  },
  // Dev only: proxy backend paths so the SPA is same-origin in development.
  nitro: {
    devProxy: {
      '/api': { target: 'http://localhost:8722/api', changeOrigin: true },
      '/auth': { target: 'http://localhost:8722/auth', changeOrigin: true },
      '/trees': { target: 'http://localhost:8722/trees', changeOrigin: true },
      '/mcp': { target: 'http://localhost:8722/mcp', changeOrigin: true },
    },
  },
})
