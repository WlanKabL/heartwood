import { loadConfig } from './config.js'
import { buildServer } from './http/server.js'
import { createDb } from './storage/db.js'
import { PostgresTreeStore } from './storage/postgres-trees.js'
import { PostgresWorkflowStore } from './storage/postgres-workflows.js'

const config = loadConfig()
const { db } = createDb(config.databaseUrl)

const server = buildServer({
  db,
  treeStore: new PostgresTreeStore(db),
  workflowStore: new PostgresWorkflowStore(db),
  now: () => new Date(),
  sessionSecret: config.sessionSecret,
})

server
  .listen({ port: config.port, host: '0.0.0.0' })
  .then(() => {
    process.stdout.write(`heartwood mcp listening on http://localhost:${config.port}/mcp\n`)
  })
  .catch((error: unknown) => {
    process.stderr.write(`failed to start: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  })
