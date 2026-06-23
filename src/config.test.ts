import { describe, it, expect } from 'vitest'
import { loadConfig } from './config.js'

describe('loadConfig', () => {
  it('parses a valid environment', () => {
    const config = loadConfig({ HEARTWOOD_TOKEN: 'secret', PORT: '9000', DB_PATH: '/tmp/x.db' })
    expect(config).toEqual({ port: 9000, token: 'secret', dbPath: '/tmp/x.db' })
  })

  it('applies defaults for port and db path', () => {
    const config = loadConfig({ HEARTWOOD_TOKEN: 'secret' })
    expect(config.port).toBe(8722)
    expect(config.dbPath).toBe('./heartwood.db')
  })

  it('throws when the token is missing', () => {
    expect(() => loadConfig({})).toThrow(/HEARTWOOD_TOKEN/)
  })

  it('throws on an invalid port', () => {
    expect(() => loadConfig({ HEARTWOOD_TOKEN: 's', PORT: 'abc' })).toThrow(/invalid configuration/)
  })
})
