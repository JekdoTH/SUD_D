import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

describe('managed Serena runtime spike prerequisites', () => {
  it('loads the official MCP v2 client and stdio transport', () => {
    expect(Client).toBeTypeOf('function');
    expect(StdioClientTransport).toBeTypeOf('function');
  });
});
