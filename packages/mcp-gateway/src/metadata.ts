import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { readonly version: string };

export const MCP_GATEWAY_INFO = Object.freeze({
  name: 'SUD-D',
  version: packageJson.version,
});
