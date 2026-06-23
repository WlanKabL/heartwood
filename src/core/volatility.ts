/**
 * Detects content that looks ephemeral: prices, percentages, explicit dates, versioned numbers.
 * Returns a plain-language warning string when something volatile is detected, or null if clean.
 *
 * This is advisory only — the caller decides what to do with the result.
 * Patterns are intentionally conservative to minimise false positives.
 */
export const detectVolatility = (content: string): string | null => {
  const patterns: RegExp[] = [
    // Currency amounts: digit immediately adjacent to a currency symbol or ISO code
    /\d[€$£]|[€$£]\d/,
    /\d\s*(?:EUR|USD|GBP)\b|\b(?:EUR|USD|GBP)\s*\d/i,
    // Percentages: a digit immediately followed by %
    /\d%/,
    // Explicit dates: ISO (2024-01-23) or European (1.1.2024 / 23.01.2024)
    /\d{4}-\d{2}-\d{2}/,
    /\b\d{1,2}\.\d{1,2}\.\d{4}\b/,
    // Versioned numbers with an explicit "v" prefix: v1, v2.3 — NOT bare decimals
    /\bv\d+(?:\.\d+)?\b/,
  ]

  const matched = patterns.some((re) => re.test(content))
  if (!matched) return null

  return 'This looks like it contains a changing figure (a price, percentage, date, or version). Durable truths only — if it will be wrong in a few months, put it in a decision-record instead.'
}
