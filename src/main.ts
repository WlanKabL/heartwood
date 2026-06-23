import { loadConfig } from './config.js'
import { createHttpServer } from './http/server.js'
import { SqliteTreeRepository } from './storage/sqlite.js'
import { SqliteWorkflowRepository } from './storage/sqlite-workflows.js'

const config = loadConfig()
const repo = new SqliteTreeRepository(config.dbPath)
const workflows = new SqliteWorkflowRepository(config.dbPath)
const server = createHttpServer({
  token: config.token,
  deps: { repo, workflows, now: () => new Date() },
})

server.listen(config.port, () => {
  process.stdout.write(`heartwood mcp listening on http://localhost:${config.port}/mcp\n`)
})
