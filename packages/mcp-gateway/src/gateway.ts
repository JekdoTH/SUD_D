import type { ClientConnectionState, GatewayState } from '@sud-d/domain';
import type { McpServer } from '@modelcontextprotocol/server';
import { createInertMcpServer } from './server.js';

export type McpGatewayTransport = Parameters<McpServer['connect']>[0];

export interface McpGatewayStatus {
  readonly gateway: GatewayState;
  readonly client: ClientConnectionState;
}

export type McpGatewayLifecycleErrorCode =
  | 'MCP_GATEWAY_START_FAILED'
  | 'MCP_GATEWAY_STOP_FAILED';

export class McpGatewayLifecycleError extends Error {
  readonly code: McpGatewayLifecycleErrorCode;

  constructor(code: McpGatewayLifecycleErrorCode, message: string) {
    super(message);
    this.name = 'McpGatewayLifecycleError';
    this.code = code;
  }
}

export class InertMcpGateway {
  private server: McpServer | undefined;
  private status: McpGatewayStatus = Object.freeze({
    gateway: 'stopped',
    client: 'disconnected',
  });

  getStatus(): McpGatewayStatus {
    return this.status;
  }

  async start(transport: McpGatewayTransport): Promise<void> {
    if (this.status.gateway === 'healthy' || this.status.gateway === 'starting') {
      return;
    }

    this.status = Object.freeze({ gateway: 'starting', client: 'disconnected' });
    const server = createInertMcpServer();

    try {
      await server.connect(transport);
      this.server = server;
      this.status = Object.freeze({ gateway: 'healthy', client: 'connected' });
    } catch {
      this.server = undefined;
      this.status = Object.freeze({ gateway: 'error', client: 'disconnected' });
      throw new McpGatewayLifecycleError(
        'MCP_GATEWAY_START_FAILED',
        'MCP gateway failed to start',
      );
    }
  }

  async stop(): Promise<void> {
    if (this.status.gateway === 'stopped') {
      return;
    }

    const server = this.server;
    if (!server) {
      this.status = Object.freeze({ gateway: 'stopped', client: 'disconnected' });
      return;
    }

    try {
      await server.close();
      this.server = undefined;
      this.status = Object.freeze({ gateway: 'stopped', client: 'disconnected' });
    } catch {
      this.status = Object.freeze({ gateway: 'error', client: 'disconnected' });
      throw new McpGatewayLifecycleError(
        'MCP_GATEWAY_STOP_FAILED',
        'MCP gateway failed to stop',
      );
    }
  }
}

export function createInertMcpGateway(): InertMcpGateway {
  return new InertMcpGateway();
}
