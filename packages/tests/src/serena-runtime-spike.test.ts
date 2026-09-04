import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const fixtureRoot = path.resolve(testDir, '../fixtures/serena-runtime-spike-ts');

describe('managed Serena runtime spike prerequisites', () => {
  it('loads the official MCP v2 client and stdio transport', () => {
    expect(Client).toBeTypeOf('function');
    expect(StdioClientTransport).toBeTypeOf('function');
  });

  it('ships a fixture with stable semantic symbols', () => {
    const source = fs.readFileSync(path.join(fixtureRoot, 'src', 'calculator.ts'), 'utf8');
    expect(source).toContain('export function add');
    expect(source).toContain('export class Calculator');
  });
});
