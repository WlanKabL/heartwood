import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { buildMcpServer, type McpDeps } from '../mcp/server.js'
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

const handle = async (
  req: IncomingMessage,
  res: ServerResponse,
  options: HttpServerOptions,
): Promise<void> => {
  if (!(req.url ?? '').startsWith('/mcp')) {
    json(res, 404, { error: 'not found' })
    return
  }
  if (!isAuthorized(req.headers.authorization, options.token)) {
    json(res, 401, { error: 'unauthorized' }, { 'www-authenticate': 'Bearer' })
    return
  }
  // Stateless: a fresh server and transport per request. The DB holds all state.
  const server = buildMcpServer(options.deps)
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
  res.on('close', () => {
    void transport.close()
    void server.close()
  })
  await server.connect(transport)
  await transport.handleRequest(req, res)
}

/** An HTTP server exposing the MCP endpoint at POST /mcp, gated by a bearer token. */
export const createHttpServer = (options: HttpServerOptions): Server => {
  return createServer((req, res) => {
    handle(req, res, options).catch((error: unknown) => {
      if (!res.headersSent) {
        json(res, 500, { error: error instanceof Error ? error.message : 'internal error' })
      }
    })
  })
}
