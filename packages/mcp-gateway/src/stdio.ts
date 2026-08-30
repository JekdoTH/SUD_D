import type { Readable, Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

export function createStdioGatewayTransport(
  input?: Readable,
  output?: Writable,
): StdioServerTransport {
  return new StdioServerTransport(input, output);
}
