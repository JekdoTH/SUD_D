import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import { createGitSafetyAdapter } from '@sud-d/infrastructure';
import { createGitCommandRunner, type GitCommandRunner, type GitCommandRunnerOptions } from '../../infrastructure/src/git-command-runner.js';

type SpawnStub = NonNullable<GitCommandRunnerOptions['spawnSync']>;
import { parseGitHubRemote } from '../../infrastructure/src/git-github-remote.js';
import { git, tempDir } from './git-safety-test-harness.js';

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
        if (args.includes('config')) {
          return { stdout: Buffer.from('global\tuser.name\n'), stderr: Buffer.alloc(0), status: 0 } as never;
        }
        return { stdout: Buffer.from('ok'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    }) as {
      runGitHubNetwork(
        cwd: string,
        args: readonly string[],
        options?: { trustedEnv?: Readonly<Record<string, string>> },
      ): { ok: boolean };
    };

    expect(runner.runGitHubNetwork('C:\\repo', ['fetch', 'upstream'], {
      trustedEnv: {
          PATH: 'C:\\attacker',
          GIT_CONFIG_GLOBAL: 'C:\\attacker\\gitconfig',
          GIT_COMMON_DIR: 'C:\\attacker\\.git',
        },
    })).toMatchObject({ ok: true });
    const call = calls.find((entry) => entry.args.includes('fetch'));
    expect(call).toBeDefined();
    if (!call) return;
    expect(call.args).toContain('protocol.allow=never');
    expect(call.args).toContain('protocol.https.allow=always');
    expect(call.args).toContain('protocol.ssh.allow=always');
    expect(call.args).toContain('fetch.recurseSubmodules=false');
    expect(call.args).toContain('push.recurseSubmodules=no');
    expect(call.args).toContain('submodule.recurse=false');
    expect(call.args).not.toContain('credential.helper=');
    const env = call.options['env'] as Record<string, string>;
    expect(env.PATH).toBe(hostEnv.PATH);
    expect(env.USERPROFILE).toBe(hostEnv.USERPROFILE);
    expect(env.SSH_AUTH_SOCK).toBe(hostEnv.SSH_AUTH_SOCK);
    expect(env.GIT_TERMINAL_PROMPT).toBe('0');
    expect(env.GCM_INTERACTIVE).toBe('Never');
    expect(env.GIT_CONFIG_GLOBAL).toBeUndefined();
    expect(env.GIT_COMMON_DIR).toBeUndefined();
    expect(env.SUD_D_ATTACKER_ENV).toBeUndefined();
  });

  it('fails closed before network when repository config rewrites a validated GitHub URL', () => {
    const root = tempDir('sudd-git-network-rewrite-');
    git(root, ['init', '-q']);
    const forbiddenUrl = 'https://127.0.0.1:9/SECRET_CONFIG_REDIRECT/';
    git(root, ['config', `url.${forbiddenUrl}.insteadOf`, 'https://github.com/']);

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, [
      'ls-remote',
      'https://github.com/acme/widgets.git',
    ], { timeoutMs: 3_000 });

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('127.0.0.1');
    expect(serialized).not.toContain('SECRET_CONFIG_REDIRECT');
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(false);
  });

  it('isolates network Git from repository config added after preflight', () => {
    const root = tempDir('sudd-git-network-config-race-');
    git(root, ['init', '-q']);
    let injected = false;
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        if (!injected && args.includes('ls-remote')) {
          git(root, [
            'config',
            'url.https://127.0.0.1:9/SECRET_RACE_REDIRECT/.insteadOf',
            'https://github.com/acme/widgets.git',
          ]);
          injected = true;
        }
        return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, [
      'ls-remote',
      '--get-url',
      'https://github.com/acme/widgets.git',
    ], { timeoutMs: 3_000 });

    expect(injected).toBe(true);
    expect(result).toMatchObject({ ok: true, value: { status: 0, overflowed: false } });
    if (!result.ok) return;
    expect(result.value.stdout.toString('utf8').trim()).toBe('https://github.com/acme/widgets.git');
    expect(result.value.stdout.toString('utf8')).not.toContain('SECRET_RACE_REDIRECT');
  });

  it('does not read repository config during a repository-backed network spawn', () => {
    const root = tempDir('sudd-git-network-race-');
    git(root, ['init', '-q']);
    const commonDir = path.join(root, '.git');
    const forbiddenUrl = 'https://127.0.0.1:9/SECRET_RACE_REDIRECT/';
    let injected = false;

    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        if (!injected && args.includes('ls-remote')) {
          injected = true;
          git(root, ['config', `url.${forbiddenUrl}.insteadOf`, 'https://github.com/']);
        }
        return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, [
      'ls-remote',
      '--get-url',
      'https://github.com/acme/widgets.git',
    ], { timeoutMs: 3_000, repositoryCommonDir: commonDir });

    expect(injected).toBe(true);
    expect(result).toMatchObject({ ok: true, value: { status: 0, overflowed: false } });
    if (!result.ok) return;
    const stdout = result.value.stdout.toString('utf8').trim();
    expect(stdout).toBe('https://github.com/acme/widgets.git');
    expect(stdout).not.toContain('127.0.0.1');
    expect(JSON.stringify(result)).not.toContain('SECRET_RACE_REDIRECT');
  });

  it('fails closed before Push when repository config rewrites a validated GitHub Push URL', () => {
    const root = tempDir('sudd-git-network-push-rewrite-');
    git(root, ['init', '-q']);
    const forbiddenUrl = 'https://127.0.0.1:9/SECRET_PUSH_REDIRECT/';
    git(root, ['config', `url.${forbiddenUrl}.pushInsteadOf`, 'https://github.com/']);

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, [
      'push',
      'https://github.com/acme/widgets.git',
      'HEAD:refs/heads/test',
    ], { timeoutMs: 3_000 });

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    expect(JSON.stringify(result)).not.toContain('SECRET_PUSH_REDIRECT');
    expect(calls.some((args) => args.includes('push'))).toBe(false);
  });

  it.each([
    ['SSH command', 'core.sshCommand', 'cmd.exe /d /c echo SECRET_SSH_COMMAND'],
    ['askpass command', 'core.askPass', 'C:\\SECRET_ASKPASS\\askpass.exe'],
    ['Git proxy command', 'core.gitProxy', 'SECRET_GIT_PROXY'],
    ['credential helper', 'credential.helper', '!echo SECRET_HELPER'],
    ['HTTP proxy', 'http.proxy', 'http://127.0.0.1:9/SECRET_PROXY'],
    ['HTTP host resolution', 'http.curloptResolve', 'github.com:443:127.0.0.1'],
    ['HTTP auth header', 'http.extraHeader', 'Authorization: SECRET_HEADER'],
    ['protocol expansion', 'protocol.ext.allow', 'always'],
    ['per-remote proxy', 'remote.upstream.proxy', 'http://127.0.0.1:9/SECRET_REMOTE_PROXY'],
    ['config include', 'include.path', 'C:\\SECRET_INCLUDE\\network.gitconfig'],
    ['conditional config include', 'includeIf.gitdir:C:/SECRET/.path', 'C:\\SECRET_INCLUDE_IF\\network.gitconfig'],
    ['SSH variant', 'ssh.variant', 'plink'],
  ])('fails closed before network for repository-controlled %s config', (_label, key, value) => {
    const root = tempDir('sudd-git-network-config-');
    git(root, ['init', '-q']);
    git(root, ['config', key, value]);

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, ['ls-remote', 'https://github.com/acme/widgets.git']);

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    expect(JSON.stringify(result)).not.toContain('SECRET_');
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(false);
  });

  it('allows repository network preflight when per-worktree config is not enabled', () => {
    const root = tempDir('sudd-git-network-no-worktree-config-');
    git(root, ['init', '-q']);

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, ['ls-remote', 'https://github.com/acme/widgets.git']);

    expect(result).toMatchObject({ ok: true, value: { status: 0, overflowed: false } });
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(true);
  });

  it('fails closed before network for unsafe per-worktree Git config', () => {
    const root = tempDir('sudd-git-network-worktree-config-');
    git(root, ['init', '-q']);
    git(root, ['config', 'extensions.worktreeConfig', 'true']);
    git(root, ['config', '--worktree', 'core.sshCommand', 'cmd.exe /d /c echo SECRET_WORKTREE_SSH']);

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, ['ls-remote', 'git@github.com:acme/widgets.git']);

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    expect(JSON.stringify(result)).not.toContain('SECRET_WORKTREE_SSH');
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(false);
  });

  it('fails closed before network when repository config cannot be parsed safely', () => {
    const root = tempDir('sudd-git-network-malformed-config-');
    git(root, ['init', '-q']);
    fs.appendFileSync(path.join(root, '.git', 'config'), '\n[broken\n', 'utf8');

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, ['ls-remote', 'https://github.com/acme/widgets.git']);

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(false);
  });

  it('fails closed before clone when host global config rewrites a validated GitHub URL', () => {
    const parent = tempDir('sudd-git-network-global-rewrite-');
    const hostHome = path.join(parent, 'host-home');
    fs.mkdirSync(hostHome, { recursive: true });
    const globalConfig = path.join(hostHome, '.gitconfig');
    const includedConfig = path.join(hostHome, 'included.gitconfig');
    fs.writeFileSync(includedConfig, '[url "https://127.0.0.1:9/SECRET_GLOBAL_REDIRECT/"]\n    insteadOf = https://github.com/\n', 'utf8');
    fs.writeFileSync(globalConfig, `[include]\n    path = ${includedConfig.replace(/\\/g, '/')}\n`, 'utf8');

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      hostEnv: {
        ...process.env,
        HOME: hostHome,
        USERPROFILE: hostHome,
        APPDATA: hostHome,
        LOCALAPPDATA: hostHome,
      },
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(parent, [
      'clone',
      '--no-recurse-submodules',
      'https://github.com/acme/widgets.git',
      path.join(parent, 'widgets'),
    ]);

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    expect(JSON.stringify(result)).not.toContain('SECRET_GLOBAL_REDIRECT');
    expect(calls.some((args) => args.includes('clone'))).toBe(false);
  });

  it('fails closed when host global conditional config rewrites GitHub for the target repository', () => {
    const root = tempDir('sudd-git-network-global-conditional-');
    git(root, ['init', '-q']);
    const hostHome = path.join(root, 'host-home');
    fs.mkdirSync(hostHome, { recursive: true });
    const includedConfig = path.join(hostHome, 'workspace-network.gitconfig');
    fs.writeFileSync(includedConfig, '[url "https://127.0.0.1:9/SECRET_CONDITIONAL_REDIRECT/"]\n    insteadOf = https://github.com/\n', 'utf8');
    const gitDirPattern = path.join(root, '.git').replace(/\\/g, '/');
    fs.writeFileSync(
      path.join(hostHome, '.gitconfig'),
      `[includeIf "gitdir/i:${gitDirPattern}"]\n    path = ${includedConfig.replace(/\\/g, '/')}\n`,
      'utf8',
    );

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      hostEnv: {
        ...process.env,
        HOME: hostHome,
        USERPROFILE: hostHome,
        APPDATA: hostHome,
        LOCALAPPDATA: hostHome,
      },
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(root, ['ls-remote', 'https://github.com/acme/widgets.git']);

    expect(result).toMatchObject({ ok: false, error: { code: 'GIT_STATE_UNSAFE' } });
    expect(JSON.stringify(result)).not.toContain('SECRET_CONDITIONAL_REDIRECT');
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(false);
  });

  it('preserves host-owned credential helper and SSH command configuration', () => {
    const parent = tempDir('sudd-git-network-host-auth-');
    const hostHome = path.join(parent, 'host-home');
    fs.mkdirSync(hostHome, { recursive: true });
    const includedConfig = path.join(hostHome, 'auth.gitconfig');
    fs.writeFileSync(includedConfig, '[credential]\n    helper = manager-core\n[core]\n    sshCommand = ssh -F C:/trusted/ssh-config\n', 'utf8');
    fs.writeFileSync(path.join(hostHome, '.gitconfig'), `[include]\n    path = ${includedConfig.replace(/\\/g, '/')}\n`, 'utf8');

    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      hostEnv: {
        ...process.env,
        HOME: hostHome,
        USERPROFILE: hostHome,
        APPDATA: hostHome,
        LOCALAPPDATA: hostHome,
        SSH_AUTH_SOCK: 'pipe://trusted-agent',
      },
      spawnSync: ((command: string, args: readonly string[], options: Record<string, unknown>) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return Reflect.apply(spawnSync, null, [command, [...args], options]) as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
    });

    const result = runner.runGitHubNetwork(parent, ['ls-remote', 'git@github.com:acme/widgets.git']);

    expect(result).toMatchObject({ ok: true, value: { status: 0, overflowed: false } });
    expect(calls.some((args) => args.includes('ls-remote'))).toBe(true);
  });

  it('allows a clone-like network command from a genuine non-repository parent', () => {
    const parent = tempDir('sudd-git-network-nonrepo-');
    const calls: string[][] = [];
    const runner = createGitCommandRunner({
      spawnSync: ((_command: string, args: readonly string[]) => {
        calls.push([...args]);
        if (args.includes('config')) {
          return { stdout: Buffer.from('global\tuser.name\n'), stderr: Buffer.alloc(0), status: 0 } as never;
        }
        return { stdout: Buffer.from('NETWORK_CALLED'), stderr: Buffer.alloc(0), status: 0 } as never;
      }) as unknown as SpawnStub,
      resolveGitExecutable: () => ({ ok: true, value: 'C:\\Program Files\\Git\\cmd\\git.exe' }),
    });

    const result = runner.runGitHubNetwork(parent, [
      'clone',
      '--no-recurse-submodules',
      'https://github.com/acme/widgets.git',
      path.join(parent, 'widgets'),
    ]);

    expect(result).toMatchObject({ ok: true, value: { status: 0, overflowed: false } });
    expect(calls.some((args) => args.includes('clone'))).toBe(true);
  });
});


describe('Git Bootstrap - safe GitHub network failures', () => {
  it.each([
    ['Authentication failed for https://token-secret@github.com/acme/widgets.git', 'GIT_AUTH_FAILED'],
    ['fatal: unable to access GitHub: connection timed out SECRET_STDERR_SENTINEL', 'GIT_REMOTE_UNREACHABLE'],
  ] as const)('normalizes network failure without leaking stderr: %s', (stderr, expectedCode) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sudd-git-network-error-'));
    const destination = path.join(root, 'clone');
    const runner: GitCommandRunner = {
      runLocal() {
        throw new Error('local Git must not run after clone network failure');
      },
      runGitHubNetwork() {
        return {
          ok: true,
          value: {
            stdout: Buffer.from('RAW_STDOUT_SENTINEL'),
            stderr: Buffer.from(stderr),
            status: 128,
            overflowed: false,
          },
        };
      },
    };

    const result = createGitSafetyAdapter({ commandRunner: runner }).cloneFromGitHub({
      remoteUrl: 'https://github.com/acme/widgets.git',
      destinationPath: destination,
    });

    expect(result).toMatchObject({
      ok: false,
      error: {
        code: expectedCode,
        metadata: { remoteName: 'clone', repository: 'acme/widgets' },
      },
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('token-secret');
    expect(serialized).not.toContain('SECRET_STDERR_SENTINEL');
    expect(serialized).not.toContain('RAW_STDOUT_SENTINEL');
  });
});
