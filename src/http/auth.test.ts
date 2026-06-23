import { describe, it, expect } from 'vitest'
import { isAuthorized, extractBearer } from './auth.js'

describe('extractBearer', () => {
  it('extracts a bearer token', () => {
    expect(extractBearer('Bearer abc123')).toBe('abc123')
  })

  it('returns null for a missing or malformed header', () => {
    expect(extractBearer(undefined)).toBeNull()
    expect(extractBearer('Basic abc')).toBeNull()
    expect(extractBearer('Bearer ')).toBeNull()
  })
})

describe('isAuthorized', () => {
  it('authorizes a matching token', () => {
    expect(isAuthorized('Bearer secret', 'secret')).toBe(true)
  })

  it('rejects a wrong token of equal length', () => {
    expect(isAuthorized('Bearer secre7', 'secret')).toBe(false)
  })

  it('rejects a missing header', () => {
    expect(isAuthorized(undefined, 'secret')).toBe(false)
  })

  it('rejects tokens of different length without throwing', () => {
    expect(isAuthorized('Bearer short', 'a-much-longer-secret')).toBe(false)
  })
})
