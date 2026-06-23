#!/usr/bin/env node
// Heartwood SessionStart hook.
// Fetches a project's protected truths from the running Heartwood server and prints
// them to stdout, which Claude Code injects into the session as context.
//
// Usage:  node hook.mjs <serverUrl> <token> <treeId>
// Example: node hook.mjs http://localhost:8722 my-token keeperlog
//
// Soft-fails by design: on any error (server down, bad token, empty tree) it prints
// nothing and exits 0, so it never blocks a session from starting.

const [, , serverUrl, token, treeId] = process.argv

const done = () => process.exit(0)

if (!serverUrl || !token || !treeId) done()

try {
  const url = `${serverUrl.replace(/\/+$/, '')}/trees/${encodeURIComponent(treeId)}/roots`
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok) done()

  const nodes = await res.json()
  if (!Array.isArray(nodes) || nodes.length === 0) done()

  const lines = nodes
    .filter((n) => n && typeof n.label === 'string' && typeof n.content === 'string')
    .sort((a, b) => (b.effectiveHardness ?? 0) - (a.effectiveHardness ?? 0))
    .map((n) => `- ${n.label}: ${n.content} (hardness ${Math.round(n.effectiveHardness ?? 0)})`)

  if (lines.length === 0) done()

  const rules = [
    '',
    '## Maintaining this tree',
    '- Add only DURABLE truths. If something changes often (a price, a metric, a percentage, a date, a current number), it does NOT belong here; put it in a decision-record document instead.',
    '- One node is one truth. Give a distinct theme its own root rather than overloading another.',
    '- Protected truths above are authoritative: do not contradict or change them without explicit human confirmation (confirm: true).',
    '- When this session establishes a new durable truth about the project, capture it with create_node — the tree only stays useful if it is kept current.',
  ]

  process.stdout.write(
    `# Project truths (Heartwood: ${treeId})\n` +
      'These are the protected, load-bearing truths of this project. Treat them as authoritative. ' +
      'Do not contradict them without explicit human confirmation.\n\n' +
      `${lines.join('\n')}\n` +
      `${rules.join('\n')}\n`,
  )
} catch {
  done()
}
