#!/usr/bin/env node
// Heartwood SessionEnd hook.
// Reads the SessionEnd JSON from stdin and prints a gentle reminder to capture
// durable truths in the Heartwood tree — only when the session looks substantive.
//
// Registered as a SessionEnd hook with matcher "prompt_input_exit" in
// .claude/settings.local.json. It CANNOT block a session and exits 0 always.
//
// Soft-fails by design: on any error it prints nothing and exits 0.

import { readFileSync } from 'node:fs'

const done = () => process.exit(0)

const NUDGE =
  'If this session established a durable truth about the project, consider capturing it in the Heartwood tree (create_node).'

// Minimum line count in the transcript to consider a session substantive.
const MIN_LINES = 40

try {
  // Read stdin fully. fd 0 works for piped input on all platforms including Windows.
  // /dev/stdin is a POSIX alias — try fd 0 directly as the primary path.
  let raw = ''
  try {
    raw = readFileSync(0, 'utf8')
  } catch {
    // Cannot read stdin at all; exit silently.
    done()
  }

  // Strip any leading BOM that PowerShell or Windows may prepend.
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)

  // Parse defensively — a missing or malformed payload just means silent exit.
  let payload = {}
  try {
    payload = JSON.parse(raw)
  } catch {
    done()
  }

  const transcriptPath = typeof payload?.transcript_path === 'string' ? payload.transcript_path : null

  if (!transcriptPath) {
    // No transcript path provided — we cannot assess substance, stay silent.
    done()
  }

  // Try to count lines in the transcript to gauge session substance.
  let lineCount = 0
  try {
    const transcript = readFileSync(transcriptPath, 'utf8')
    lineCount = transcript.split('\n').length
  } catch {
    // Transcript unreadable — stay silent rather than spam every session.
    done()
  }

  if (lineCount >= MIN_LINES) {
    process.stdout.write(NUDGE + '\n')
  }
} catch {
  // Outermost safety net — never let this hook throw.
}

done()
