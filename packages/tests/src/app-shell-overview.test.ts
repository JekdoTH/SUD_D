import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { IPC_CHANNELS } from '@sud-d/contracts';
import { registerDesktopAppIpcHandlers } from '../../desktop/electron/app-ipc.js';
import { presentConnectionState } from '../../desktop/src/connection-ui-model.js';

interface InvokeEventLike {
  readonly sender: unknown;
}

function relativeLuminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('App Shell + Overview', () => {
  it('opens only fixed external destinations through zero-input desktop app actions', async () => {
    const handlers = new Map<string, (event: InvokeEventLike, raw?: unknown) => unknown>();
    const openExternal = vi.fn(async (_url: string) => undefined);

    registerDesktopAppIpcHandlers(
      {
        handle(channel, listener) {
          handlers.set(channel, listener);
        },
      },
      openExternal,
      (sender) => sender === 'trusted-renderer',
    );

    const expectedActions = [
      [IPC_CHANNELS.APP_OPEN_CHATGPT_WEB, 'app:openChatGPTWeb', 'https://chatgpt.com/'],
      [IPC_CHANNELS.APP_OPEN_OPENAI_API_KEYS_PAGE, 'app:openOpenAiApiKeysPage', 'https://platform.openai.com/settings/organization/api-keys'],
      [IPC_CHANNELS.APP_OPEN_OPENAI_TUNNEL_SETTINGS_PAGE, 'app:openOpenAiTunnelSettingsPage', 'https://platform.openai.com/settings/organization/tunnels'],
    ] as const;

    for (const [channel, expectedChannel, expectedUrl] of expectedActions) {
      expect(channel).toBe(expectedChannel);
      const handler = handlers.get(channel);
      expect(handler).toBeDefined();

      expect(await handler?.({ sender: 'untrusted-renderer' })).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(await handler?.({ sender: 'trusted-renderer' }, 'file:///C:/Windows/System32/calc.exe')).toMatchObject({
        ok: false,
        error: { code: 'VALIDATION_FAILED' },
      });
      expect(openExternal).not.toHaveBeenCalledWith('file:///C:/Windows/System32/calc.exe');

      expect(await handler?.({ sender: 'trusted-renderer' })).toEqual({ ok: true, value: null });
      expect(openExternal).toHaveBeenLastCalledWith(expectedUrl);
    }

    expect(openExternal).toHaveBeenCalledTimes(3);
  });

  it('wires the fixed-purpose action to Electron shell.openExternal in the main process', () => {
    const main = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/electron/main.ts'),
      'utf8',
    );

    expect(main).toContain('shell,');
    expect(main).toContain('registerDesktopAppIpcHandlers');
    expect(main).toContain('shell.openExternal(url)');
    expect(main).not.toMatch(/shell\.openExternal\([^)]*(raw|event|input|href)/i);
  });

  it('uses the latest approved SUD-D logo and icon without cropping or distortion', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/main.ts'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/index.css'), 'utf8');
    const logo = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/assets/sud-d-logo.png'));
    const icon = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/assets/sud-d-app-icon.png'));
    const logoWidth = logo.readUInt32BE(16);
    const logoHeight = logo.readUInt32BE(20);
    const iconWidth = icon.readUInt32BE(16);
    const iconHeight = icon.readUInt32BE(20);

    expect([logoWidth, logoHeight]).toEqual([375, 125]);
    expect(createHash('sha256').update(logo).digest('hex')).toBe(
      '13a25ffade5475ac448304724e81a89f68eb51e979af7ab1c5ba26f840229d99',
    );
    expect([iconWidth, iconHeight]).toEqual([192, 192]);
    expect(createHash('sha256').update(icon).digest('hex')).toBe(
      '172bb88ca88a94f1c013f4f589dbf4ebdcbe2405fd6d9d241764fcb921eba467',
    );
    expect(main).toContain("path.join(__dirname, '../src/assets/sud-d-app-icon.png')");
    expect(main).toContain('icon: windowIconPath');
    expect(css).toMatch(/\.sidebar-logo-image\s*\{[\s\S]*?object-fit:\s*contain/u);
    expect(css).not.toMatch(/\.sidebar-logo-image\s*\{[^}]*object-fit:\s*cover/u);
  });

  it('uses real connection state for the shell status and fails safe when status cannot be read', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/App.tsx'), 'utf8');

    expect(presentConnectionState('connected')).toMatchObject({ label: 'Connected', tone: 'success' });
    expect(presentConnectionState('stopped')).toMatchObject({ label: 'Disconnected', tone: 'neutral' });
    expect(presentConnectionState('waiting_for_client')).toMatchObject({ label: 'Waiting for ChatGPT', tone: 'warning' });
    expect(presentConnectionState('error')).toMatchObject({ label: 'Connection error', tone: 'danger' });

    expect(app).toContain('window.sudD.connection.status()');
    expect(app).toContain('presentConnectionState');
    expect(app).not.toContain('window.sudD.health.check()');
    expect(app).not.toContain('System healthy');
    expect(app).toContain("label: 'Connection unavailable'");
    expect(app).toContain('setShellConnectionPresentation(CONNECTION_UNAVAILABLE_PRESENTATION)');
  });

  it('implements the approved shell and truthful Overview hierarchy without the connection-method selector', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/App.tsx'), 'utf8');
    const home = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/HomePage.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/index.css'), 'utf8');

    expect(app).toContain("./assets/sud-d-logo.png");
    expect(app).toContain('Open ChatGPT Web');
    expect(app).not.toContain('System healthy');
    expect(app).toContain('app-topbar');
    expect(app).not.toMatch(/Sign in|up to date|account/i);

    expect(home).not.toContain('Manage your local ChatGPT connection, workspace, and safety status at a glance.');
    expect(home).not.toMatch(/<h1[^>]*>Overview<\/h1>/u);
    expect(home).toContain('Connection Setting');
    expect(home).not.toContain('Connection details');
    expect(home).toMatch(/Connection Setting[\s\S]{0,240}onNavigate\('connection'\)|onNavigate\('connection'\)[\s\S]{0,240}Connection Setting/u);
    expect(home).toContain('Approved workspaces');
    expect(home).toContain('Recent activity');
    expect(home).toContain('Safety status');
    expect(home).toContain('Workspace-bound access');
    expect(home).toContain('Network denied by default');
    expect(home).toContain('Credentials stay hidden from the renderer');
    expect(home).not.toMatch(/Connection Method|IE Coder Connect|Active Sessions|Uptime|Permissions/);
    expect(home).not.toMatch(/api.?key.{0,30}(suffix|slice\s*\(\s*-)/i);

    expect(css).toContain('.app-topbar');
    expect(css).toContain('.overview-connection-card');
    expect(css).toContain('.overview-bottom-grid');
  });

  it('places Overview connection actions under the left copy and shows display-only workspace access', () => {
    const home = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/HomePage.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/index.css'), 'utf8');

    expect(home).toMatch(
      /<div className="overview-connection-copy">[\s\S]*<div className="overview-primary-actions">[\s\S]*id="overview-primary-connection-action"[\s\S]*Connection Setting[\s\S]*<\/div>[\s\S]*<\/div>\s*<\/div>\s*<dl className="overview-status-list">/u,
    );
    expect(css).not.toMatch(/\.overview-connection-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s*minmax\(270px,\s*0\.9fr\)\s*minmax\(190px,\s*auto\)/u);
    expect(css).toMatch(/\.overview-connection-card\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1\.35fr\)\s*minmax\(270px,\s*0\.9fr\)/u);

    expect(home).toMatch(/role="columnheader">Access<\/span>/u);
    expect(home).toContain('Read & write');
    expect(home).toContain('workspace-access-badge');
    expect(home).not.toMatch(/workspace-access[^\n]*(button|select|input|checkbox|onClick|onChange)/iu);
    expect(home).not.toMatch(/permissions?|capability|policy/i);
  });

  it('shows only the active workspace in Overview and keeps add workspace navigation fixed', () => {
    const home = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/HomePage.tsx'), 'utf8');

    expect(home).toContain('const visibleWorkspaces = activeWorkspace ? [activeWorkspace] : [];');
    expect(home).not.toContain('.slice(0, 3)');
    expect(home).toContain('+ Add Workspace');
    expect(home).toContain("onClick={() => onNavigate('workspaces')}");
  });

  it('orders the sidebar as Overview, Connection, Workspaces, Activity, Team, Security, Recovery, Environment', () => {
    const app = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/App.tsx'), 'utf8');
    const navBlock = app.slice(app.indexOf('const NAV_ITEMS'), app.indexOf('const CHECKING_CONNECTION_PRESENTATION'));

    expect(navBlock).toMatch(/overview[\s\S]*connection[\s\S]*workspaces[\s\S]*activity[\s\S]*team[\s\S]*security[\s\S]*recovery[\s\S]*environment/u);
  });

  it('keeps the Connection hero and setup cards while removing the redundant page header row', () => {
    const connection = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/ConnectionPage.tsx'), 'utf8');

    expect(connection).not.toContain('page-header page-header-row');
    expect(connection).not.toMatch(/<h1 className="page-title">Connection<\/h1>/u);
    expect(connection).not.toContain('Set up and connect ChatGPT entirely from SUD-D.');
    expect(connection).toContain('card connection-hero');
    expect(connection).toContain('ChatGPT Connection');
    expect(connection).toContain('OpenAI Secure MCP Tunnel');
    expect((connection.match(/className="card setup-card"/g) ?? []).length).toBe(3);
  });

  it('adds fixed OpenAI setup links below existing Connection setup controls', () => {
    const connection = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/ConnectionPage.tsx'), 'utf8');

    expect(connection).toMatch(/id="connection-credential-setup"[\s\S]*Replace API Key[\s\S]*id="connection-credential-remove"[\s\S]*Remove API Key[\s\S]*setup-external-link-row[\s\S]*Get API Key from OpenAI/u);
    expect(connection).toMatch(/Change Tunnel configuration[\s\S]*setup-external-link-row[\s\S]*Open Tunnel Settings/u);
    expect(connection).toContain('openOpenAiApiKeysPage');
    expect(connection).toContain('openOpenAiTunnelSettingsPage');
    expect(connection).toContain('UiIcon name="external-link"');
  });

  it('keeps muted UI text readable and the initial Overview connection action inert while loading', () => {
    const home = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/pages/HomePage.tsx'), 'utf8');
    const css = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/src/index.css'), 'utf8');
    const dim = css.match(/--text-dim:\s*(#[0-9a-fA-F]{6})/u)?.[1];

    expect(dim).toBeDefined();
    expect(contrastRatio(dim ?? '#ffffff', '#ffffff')).toBeGreaterThanOrEqual(4.5);
    expect(home).toMatch(/connection\s*===\s*null\s*\?\s*'Checking…'/u);
    expect(home).toMatch(/disabled=\{busy\s*\|\|\s*connection\s*===\s*null/u);
  });

  it('opens DevTools only behind an explicit development opt-in', () => {
    const main = fs.readFileSync(path.join(process.cwd(), 'packages/desktop/electron/main.ts'), 'utf8');

    expect(main).toContain("process.env['SUD_D_OPEN_DEVTOOLS'] === '1'");
    expect(main).toMatch(/if \(devUrl[\s\S]*SUD_D_OPEN_DEVTOOLS[\s\S]*openDevTools/u);
    expect(main).not.toMatch(/if \(devUrl\) \{\s*void win\.loadURL\(devUrl\);\s*win\.webContents\.openDevTools\(\);/u);
  });

  it('exposes a zero-argument renderer bridge without arbitrary URL authority', () => {
    const preload = fs.readFileSync(
      path.join(process.cwd(), 'packages/desktop/electron/preload.ts'),
      'utf8',
    );

    const appStart = preload.indexOf('  app: {');
    const appEnd = preload.indexOf('  health: {', appStart);
    const appSurface = appStart >= 0 && appEnd > appStart ? preload.slice(appStart, appEnd) : '';

    expect(appSurface).toContain('openChatGPTWeb: ()');
    expect(appSurface).toContain('openOpenAiApiKeysPage: ()');
    expect(appSurface).toContain('openOpenAiTunnelSettingsPage: ()');
    expect(appSurface).toContain('IPC_CHANNELS.APP_OPEN_CHATGPT_WEB');
    expect(appSurface).toContain('IPC_CHANNELS.APP_OPEN_OPENAI_API_KEYS_PAGE');
    expect(appSurface).toContain('IPC_CHANNELS.APP_OPEN_OPENAI_TUNNEL_SETTINGS_PAGE');
    expect(appSurface).not.toMatch(/openChatGPTWeb:\s*\([^)]*(url|uri|href)/i);
    expect(appSurface).not.toMatch(/openOpenAiApiKeysPage:\s*\([^)]*(url|uri|href)/i);
    expect(appSurface).not.toMatch(/openOpenAiTunnelSettingsPage:\s*\([^)]*(url|uri|href)/i);
    expect(appSurface).not.toContain('shell.openExternal');
    expect(preload).not.toContain('ipcRenderer.send');
  });
});
