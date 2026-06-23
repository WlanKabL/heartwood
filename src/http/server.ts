import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMcpServer, type McpDeps } from '../mcp/server.js'
import { getProtectedNodes } from '../core/service.js'
import { isAuthorized } from './auth.js'

export interface HttpServerOptions {
  token: string
  deps: McpDeps
}

const json = (
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void => {
  res.writeHead(status, { 'content-type': 'application/json', ...headers })
  res.end(JSON.stringify(body))
}

const ROOTS_PATH = /^\/trees\/([^/]+)\/roots\/?$/

const handle = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpServerOptions,
): Promise<void> => {
  if (!isAuthorized(req.headers.authorization, options.token)) {
    json(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' })
    return
  }

  const path = (req.url ?? '').split('?')[0] ?? ''

  // MCP endpoint for agents.
  if (path.startsWith('/mcp')) {
    const server = buildMcpServer(options.deps)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    await server.connect(transport)
    await transport.handleRequest(req, res)
    return
  }

  // Plain REST read for the session hook: the protected core of a tree.
  const rootsMatch = ROOTS_PATH.exec(path)
  if (req.method === 'GET' && rootsMatch) {
    const treeId = decodeURIComponent(rootsMatch[1]!)
    json(res, 200, await getProtectedNodes(options.deps.repo, treeId, options.deps.now()))
    return
  }

  json(res, 404, { error: 'not found' })
}

/** HTTP server: MCP at /mcp for agents, GET /trees/:treeId/roots for the hook. Bearer-gated. */
export const createHttpServer = (options: HttpServerOptions): Server => {
  return createServer((req, res) => {
    handle(req, res, options).catch((error: unknown) => {
      if (!res.headersSent) {
        json(res, 500, { error: error instanceof Error ? error.message : 'internal error' })
      }
    })
  })
}
