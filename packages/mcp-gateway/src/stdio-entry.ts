import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createDefaultProductionMcpServer } from './workspace-file-server.js';

void serveStdio(() => createDefaultProductionMcpServer());
console.error('SUD-D MCP Gateway running on stdio');
