import { describe, expect, it } from 'vitest';

import { createGitCommandRunner, type GitCommandRunnerOptions } from '../../infrastructure/src/git-command-runner.js';

type SpawnStub = NonNullable<GitCommandRunnerOptions['spawnSync']>;
import { parseGitHubRemote } from '../../infrastructure/src/git-github-remote.js';

describe('Git Bootstrap - GitHub remote parsing', () => {
  it.each([
    ['https://github.com/acme/widgets.git', { transport: 'https', owner: 'acme', repository: 'widgets', safeRepository: 'acme/widgets', canonicalUrl: 'https://github.com/acme/widgets.git' }],
    ['https://github.com/acme/widgets', { transport: 'https', owner: 'acme', repository: 'widgets', safeRepository: 'acme/widgets', canonicalUrl: 'https://github.com/acme/widgets.git' }],
    ['git@github.com:acme/widgets.git', { transport: 'ssh', owner: 'acme', repository: 'widgets', safeRepository: 'acme/widgets', canonicalUrl: 'git@github.com:acme/widgets.git' }],
    ['ssh://git@github.com/acme/widgets.git', { transport: 'ssh', owner: 'acme', repository: 'widgets', safeRepository: 'acme/widgets', canonicalUrl: 'git@github.com:acme/widgets.git' }],
  ] as const)('normalizes accepted GitHub remote %s', (raw, expected) => {
    const result = parseGitHubRemote(raw) as { ok: boolean; value?: unknown; error?: { code: string; message: string } };
    expect(result).toEqual({ ok: true, value: expected });
  });

  it.each([
    'https://token@github.com/acme/widgets.git',
    'https://github.example/acme/widgets.git',
    'https://github.com/acme/widgets.git?token=x',
    'https://github.com/acme/widgets.git#fragment',
    'ssh://root@github.com/acme/widgets.git',
    'ssh://git@github.com:2222/acme/widgets.git',
    'file:///C:/repo',
    'git@github.com:../widgets.git',
    'git@github.com:acme/../widgets.git',
  ])('rejects unsupported remote without echoing raw input: %s', (raw) => {
    const result = parseGitHubRemote(raw) as { ok: boolean; error?: { code: string; message: string; metadata?: Record<string, unknown> } };
    expect(result.ok).toBe(false);
    if (result.ok || !result.error) return;
    expect(result.error.code).toBe('GIT_REMOTE_UNSUPPORTED');
    expect(result.error.message).not.toContain(raw);
    expect(JSON.stringify(result.error.metadata ?? {})).not.toContain(raw);
  });
});

describe('Git Bootstrap - trusted Git command runner modes', () => {
  it('keeps local Git hermetic and accepts only infrastructure-owned trustedEnv', () => {
    const calls: Array<{ command: string; args: readonly string[]; options: Record<string, unknown> }> = [];
    const runner = createGitCommandRunner({
      resolveGitExecutable: () => ({ ok: true, value: 'C:\\Program Files\\Git\\cmd\\git.exe' }),
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push({ command, args, options });
        return { stdout: Buffer.from('ok'), stderr: Buffer.alloc(0), status: 0 };
      }) as unknown as SpawnStub,
    }) as {
      runLocal(cwd: string, args: readonly string[], options?: { trustedEnv?: Readonly<Record<string, string>> }): { ok: boolean };
    };

    const prior = process.env.SUD_D_ATTACKER_ENV;
    process.env.SUD_D_ATTACKER_ENV = 'must-not-flow';
    try {
      expect(runner.runLocal('C:\\repo', ['status'], {
        trustedEnv: {
          GIT_INDEX_FILE: 'C:\\trusted\\index',
          PATH: 'C:\\attacker',
          SUD_D_ATTACKER_ENV: 'request-must-not-flow',
        },
      })).toMatchObject({ ok: true });
    } finally {
      if (prior === undefined) delete process.env.SUD_D_ATTACKER_ENV;
      else process.env.SUD_D_ATTACKER_ENV = prior;
    }

    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.command).toBe('C:\\Program Files\\Git\\cmd\\git.exe');
    expect(call.args).toContain('--no-pager');
    expect(call.args).toContain('credential.helper=');
    expect(call.args).toContain('protocol.allow=never');
    expect(call.args.at(-1)).toBe('status');
    expect(call.options).toMatchObject({ cwd: 'C:\\repo', shell: false, windowsHide: true });
    const env = call.options['env'] as Record<string, string>;
    expect(env.PATH).toBe('');
    expect(env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GIT_INDEX_FILE).toBe('C:\\trusted\\index');
    expect(env.PATH).toBe('');
    expect(env.SUD_D_ATTACKER_ENV).toBeUndefined();
  });

  it('uses only a fixed host-owned allowlist for GitHub network mode', () => {
    const calls: Array<{ args: readonly string[]; options: Record<string, unknown> }> = [];
    const hostEnv = {
      ...process.env,
      PATH: 'C:\\Windows\\System32;C:\\Program Files\\Git\\cmd',
      USERPROFILE: 'C:\\Users\\JJ',
      HOME: 'C:\\Users\\JJ',
      APPDATA: 'C:\\Users\\JJ\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\JJ\\AppData\\Local',
      SSH_AUTH_SOCK: 'pipe://trusted-agent',
      SUD_D_ATTACKER_ENV: 'must-not-flow',
    };
    const runner = createGitCommandRunner({
      hostEnv,
      resolveGitExecutable: () => ({ ok: true, value: 'C:\\Program Files\\Git\\cmd\\git.exe' }),
      spawnSync: ((_command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push({ args, options });
        return { stdout: Buffer.from('ok'), stderr: Buffer.alloc(0), status: 0 };
      }) as unknown as SpawnStub,
    }) as {
      runGitHubNetwork(
        cwd: string,
        args: readonly string[],
        options?: { trustedEnv?: Readonly<Record<string, string>> },
      ): { ok: boolean };
    };

    expect(runner.runGitHubNetwork('C:\\repo', ['fetch', 'upstream'], {
      trustedEnv: { PATH: 'C:\\attacker', GIT_CONFIG_GLOBAL: 'C:\\attacker\\gitconfig' },
    })).toMatchObject({ ok: true });
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.args).toContain('protocol.allow=never');
    expect(call.args).toContain('protocol.https.allow=always');
    expect(call.args).toContain('protocol.ssh.allow=always');
    expect(call.args).not.toContain('credential.helper=');
    const env = call.options['env'] as Record<string, string>;
    expect(env.PATH).toBe(hostEnv.PATH);
    expect(env.USERPROFILE).toBe(hostEnv.USERPROFILE);
    expect(env.SSH_AUTH_SOCK).toBe(hostEnv.SSH_AUTH_SOCK);
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GCM_INTERACTIVE).toBe('Never');
    expect(env.GIT_CONFIG_GLOBAL).toBeUndefined();
    expect(env.SUD_D_ATTACKER_ENV).toBeUndefined();
  });
});
