import { describe, it, expect } from 'vitest'
import { detectVolatility } from './volatility.js'

describe('detectVolatility', () => {
  it('flags a currency symbol adjacent to a digit (€)', () => {
    expect(detectVolatility('price is €29')).not.toBeNull()
  })

  it('flags a currency symbol adjacent to a digit ($)', () => {
    expect(detectVolatility('costs $9.99 per month')).not.toBeNull()
  })

  it('flags a currency symbol adjacent to a digit (£)', () => {
    expect(detectVolatility('subscription costs £15')).not.toBeNull()
  })

  it('flags a digit before a currency symbol', () => {
    expect(detectVolatility('monthly fee: 29€')).not.toBeNull()
  })

  it('flags ISO currency code adjacent to a digit (EUR)', () => {
    expect(detectVolatility('baseline price is 12 EUR')).not.toBeNull()
  })

  it('flags ISO currency code adjacent to a digit (USD)', () => {
    expect(detectVolatility('USD 99 per seat')).not.toBeNull()
  })

  it('flags a percentage', () => {
    expect(detectVolatility('conversion rate is 4% this quarter')).not.toBeNull()
  })

  it('flags an ISO date', () => {
    expect(detectVolatility('launched on 2024-03-15')).not.toBeNull()
  })

  it('flags a European date format', () => {
    expect(detectVolatility('registered on 22.6.2026')).not.toBeNull()
  })

  it('flags a zero-padded European date format', () => {
    expect(detectVolatility('registered on 01.01.2025')).not.toBeNull()
  })

  it('flags an explicit version with v prefix', () => {
    expect(detectVolatility('ships in v2.3')).not.toBeNull()
  })

  it('flags a single-digit version with v prefix', () => {
    expect(detectVolatility('currently on v4')).not.toBeNull()
  })

  it('does NOT flag bare decimals without a v prefix', () => {
    expect(detectVolatility('rated 3.5 stars out of 5')).toBeNull()
  })

  it('does NOT flag clean durable truths about identity', () => {
    expect(detectVolatility('built by a keeper for keepers')).toBeNull()
  })

  it('does NOT flag clean durable truths mentioning count in words', () => {
    expect(detectVolatility('three core capabilities drive the product')).toBeNull()
  })

  it('does NOT flag ordinal numbers without currency or percent', () => {
    expect(detectVolatility('the second major release solidified the API')).toBeNull()
  })

  it('returns the expected warning string when triggered', () => {
    const result = detectVolatility('price is €29')
    expect(result).toMatch(/changing figure/)
    expect(result).toMatch(/decision-record/)
  })
})
