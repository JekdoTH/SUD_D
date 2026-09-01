import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

import {
  createToolCapabilityRegistry,
  createToolKernel,
  createWorkspaceFileCapabilities,
  type ToolKernel,
} from '@sud-d/application';
import type { InternalRoot } from '@sud-d/domain';
import {
  WORKSPACE_TEXT_FILE_LIMITS,
  canonicalizePath,
  createAuditRepository,
  createWorkspaceRepository,
  createWorkspaceTextFileSystem,
  getDataRoot,
  openDatabase,
  type AuditRepository,
  type WorkspaceRepository,
  type WorkspaceTextFileSystem,
} from '@sud-d/infrastructure';
import { MCP_GATEWAY_INFO } from './metadata.js';

const MCP_STDIO_SESSION = Object.freeze({ id: 'mcp-stdio', type: 'mcp-stdio' as const });

const relativePathSchema = z.string().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxRelativePathChars);
const listInputSchema = z.object({
  relativePath: relativePathSchema,
  limit: z.number().int().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxListEntries).optional(),
}).strict();
const pathInputSchema = z.object({ relativePath: relativePathSchema }).strict();
const searchInputSchema = z.object({
  relativePath: relativePathSchema,
  query: z.string().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxSearchQueryChars),
  limit: z.number().int().min(1).max(WORKSPACE_TEXT_FILE_LIMITS.maxSearchMatches).optional(),
}).strict();
const writeInputSchema = z.object({
  relativePath: relativePathSchema,
  content: z.string(),
}).strict().superRefine((value, context) => {
  if (Buffer.byteLength(value.content, 'utf8') > WORKSPACE_TEXT_FILE_LIMITS.maxTextBytes) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['content'],
      message: 'Text content exceeds the trusted size limit',
    });
  }
});

export interface ProductionMcpServerDependencies {
  readonly workspaceRepo: WorkspaceRepository;
  readonly auditRepo: AuditRepository;
  readonly internalRoots: readonly InternalRoot[];
  readonly fileSystem: WorkspaceTextFileSystem;
}

export function createProductionMcpServer(
  dependencies: ProductionMcpServerDependencies,
): McpServer {
  const capabilities = createWorkspaceFileCapabilities({
    workspaceRepo: dependencies.workspaceRepo,
    internalRoots: dependencies.internalRoots,
    fileSystem: dependencies.fileSystem,
  });
  const registry = createToolCapabilityRegistry(capabilities);
  if (!registry.ok) {
    throw new Error('SUD-D production tool registration failed');
  }
  const kernel = createToolKernel({ registry: registry.value, audit: dependencies.auditRepo });
  const server = new McpServer(MCP_GATEWAY_INFO, {
    capabilities: { tools: { listChanged: false } },
  });

  registerWorkspaceFileTools(server, kernel);
  return server;
}

export function createDefaultProductionMcpServer(): McpServer {
  const dataRoot = getDataRoot();
  const db = openDatabase(path.join(dataRoot, 'sud-d.db'));
  const canonicalDataRoot = canonicalizePath(dataRoot);
  if (!canonicalDataRoot.ok) {
    db.close();
    throw new Error('SUD-D workspace security initialization failed');
  }
  return createProductionMcpServer({
    workspaceRepo: createWorkspaceRepository(db),
    auditRepo: createAuditRepository(db),
    internalRoots: [{ canonicalPath: canonicalDataRoot.value, label: 'SUD-D data root' }],
    fileSystem: createWorkspaceTextFileSystem(),
  });
}

function registerWorkspaceFileTools(server: McpServer, kernel: ToolKernel): void {
  server.registerTool(
    'workspace.list',
    {
      title: 'List workspace directory',
      description: 'List safe entries in a directory under the active SUD-D Workspace.',
      inputSchema: listInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.list', input),
  );
  server.registerTool(
    'workspace.stat',
    {
      title: 'Stat workspace resource',
      description: 'Return safe metadata for a resource under the active SUD-D Workspace.',
      inputSchema: pathInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.stat', input),
  );
  server.registerTool(
    'workspace.read_text',
    {
      title: 'Read workspace text file',
      description: 'Read a bounded UTF-8 text file under the active SUD-D Workspace.',
      inputSchema: pathInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.read_text', input),
  );
  server.registerTool(
    'workspace.search_text',
    {
      title: 'Search workspace text',
      description: 'Search literal text recursively within a safe active-workspace directory.',
      inputSchema: searchInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.search_text', input),
  );
  server.registerTool(
    'workspace.create_text_file',
    {
      title: 'Create workspace text file',
      description: 'Create a bounded UTF-8 text file under the active SUD-D Workspace; fails if it already exists.',
      inputSchema: writeInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.create_text_file', input),
  );
  server.registerTool(
    'workspace.write_text_file',
    {
      title: 'Write workspace text file',
      description: 'Replace the contents of an existing regular UTF-8 project file under the active SUD-D Workspace.',
      inputSchema: writeInputSchema,
    },
    async (input) => invokeKernel(kernel, 'workspace.write_text_file', input),
  );
}

async function invokeKernel(
  kernel: ToolKernel,
  capability: string,
  input: unknown,
) {
  const result = await kernel.invoke({
    invocationId: randomUUID(),
    session: MCP_STDIO_SESSION,
    capability,
    input,
  });
  const payload = result.ok
    ? { ok: true, code: result.code, value: result.value }
    : {
        ok: false,
        code: result.code,
        outcome: result.outcome,
        ...(result.policyDecision ? { policyDecision: result.policyDecision } : {}),
        ...(result.causeCode ? { causeCode: result.causeCode } : {}),
      };
  return {
    ...(result.ok ? {} : { isError: true }),
    content: [{ type: 'text' as const, text: JSON.stringify(payload) }],
  };
}
