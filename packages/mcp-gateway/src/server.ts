import { McpServer } from '@modelcontextprotocol/server';
import { MCP_GATEWAY_INFO } from './metadata.js';

export function createInertMcpServer(): McpServer {
  return new McpServer(MCP_GATEWAY_INFO, {
    capabilities: {
      tools: { listChanged: false },
    },
  });
}
