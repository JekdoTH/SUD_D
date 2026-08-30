import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createInertMcpServer } from './server.js';

void serveStdio(() => createInertMcpServer());
console.error('SUD-D MCP Gateway running on stdio');
