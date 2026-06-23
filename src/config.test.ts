import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('parses the multi-tenant env', () => {
    const cfg = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5432/heartwood',
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
      SESSION_SECRET: 'x'.repeat(32),
      PUBLIC_URL: 'http://localhost:8722',
    })
    expect(cfg.databaseUrl).toContain('postgres://')
    expect(cfg.github.clientId).toBe('id')
  })

  it('applies the default port', () => {
    const cfg = loadConfig({
      DATABASE_URL: 'postgres://u:p@localhost:5432/heartwood',
      GITHUB_CLIENT_ID: 'id',
      GITHUB_CLIENT_SECRET: 'secret',
      SESSION_SECRET: 'x'.repeat(32),
      PUBLIC_URL: 'http://localhost:8722',
    })
    expect(cfg.port).toBe(8722)
  })

  it('rejects a missing DATABASE_URL', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/)
  })

  it('throws on an invalid port', () => {
    expect(() =>
      loadConfig({
        DATABASE_URL: 'postgres://u:p@localhost:5432/heartwood',
        GITHUB_CLIENT_ID: 'id',
        GITHUB_CLIENT_SECRET: 'secret',
        SESSION_SECRET: 'x'.repeat(32),
        PUBLIC_URL: 'http://localhost:8722',
        PORT: 'abc',
      }),
    ).toThrow(/invalid configuration/)
  })
})
