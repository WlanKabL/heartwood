# Heartwood — Claude Instructions

> Read this and [README.md](README.md) before generating any code or suggestion.
> Communicate with the user in **German**. All code, identifiers, comments and commit messages stay **English**.

## What Heartwood is

A service that stores a project's truth as a hardened, hierarchical tree (roots → trunk → branches → leaves) and serves it to AI agents across runtimes. Depth equals authority: the deeper a node, the harder a prompt can bend it. Full concept in [README.md](README.md), build sequence in [ROADMAP.md](ROADMAP.md).

This repo is itself the first example of what the tool manages: its own roots are below.

## Roots (non-negotiable, change only with explicit human YES)

- **Depth is one axis, four meanings.** Deeper = more authoritative against prompts, more stable over time, more expensive to change, more immutable.
- **Hardness = max(set, structural, proven).** Set by a human, structural from how much builds on top (load-bearing), proven from age unchanged.
- **The iron rule: AI proposes, server enforces.** Hardness is computed and stored server-side and is authoritative at read time. An AI may propose placement/hardness for *new* nodes only; it never re-rates existing nodes at runtime. The server, not the prompt, decides what is hard.
- **Changing a hard node requires a cascade preview plus explicit human confirmation.** The friction is the feature.
- **The engine is universal, the positioning is narrow.** Build broad, ship pointed at one use case.
- **Workflows are an application, not the core.** Core = tree + retrieval + hardness.

## Non-goals

Not a revenue product (portfolio + self-use). Not an agent runtime (layers on top of existing ones). Not a methodology/prompt pack (it is the knowledge layer underneath).

## Code defaults

- TypeScript strict. No `any`, no implicit any, no `as unknown` shortcuts.
- `async/await` only. Named exports. `const` over `let`.
- Tests are part of a feature, not an afterthought. Cover happy path, failure path, edge cases.
- No `TODO`/`FIXME`/`console.log`/dead code in committed work. No half-finished features.

## Stack

Node + TypeScript (strict, ESM/NodeNext, explicit `.js` imports), Fastify HTTP, `@modelcontextprotocol/sdk` Streamable HTTP at `/mcp`, Postgres via Drizzle, zod 4, vitest, pnpm 10, Node 22. GitHub-OAuth (`@fastify/oauth2`) for the browser, hashed `hw_` bearer tokens for MCP. Frontend is Nuxt. Native modules note: `@fastify/secure-session` pulls in `sodium-native`, which needs glibc, so the backend image is `node:22-slim`, not alpine.

## Planning

Roadmap lives in [ROADMAP.md](ROADMAP.md). **Phases 0 through 4 are shipped and live in production** at <https://heartwood.wlankabl.com>; only Phase 5 (opening up) is open. Heartwood's own identity is the first tree, authored through the tool; KeeperLog is the first real product tree.
