// Discovery identity is intentionally tied to the exposed MCP tool surface, not the app/package release.
// Change this only when tools/list names, descriptions, or schemas change.
export const MCP_TOOL_SURFACE_VERSION = '2026.9.14';

export const MCP_GATEWAY_INFO = Object.freeze({
  name: 'SUD-D',
  version: MCP_TOOL_SURFACE_VERSION,
});
