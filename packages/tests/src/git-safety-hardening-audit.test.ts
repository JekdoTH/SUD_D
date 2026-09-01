import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import type { GitCheckpointResult, GitDiffResult, GitStatusResult } from '@sud-d/infrastructure';
import {
  git,
  kernelValue,
  makeHarness,
  requireCreatedCheckpoint,
} from './git-safety-test-harness.js';

describe('Git Safety - hidden execution hardening and audit', () => {
  it('does not execute hooks, filters, fsmonitor, signing, helpers, aliases, or configured remote transport', async () => {
    const h = await makeHarness();
    const marker = path.join(h.workspaceRoot, 'forbidden-execution.marker');
    const hookBody = '#!/bin/sh\necho hook > forbidden-execution.marker\nexit 1\n';
    fs.writeFileSync(path.join(h.workspaceRoot, '.gitattributes'), 'tracked.txt filter=evil\n');
    git(h.workspaceRoot, ['add', '--', '.gitattributes']);
    git(h.workspaceRoot, ['commit', '-q', '-m', 'attributes fixture']);
    for (const hookName of ['pre-commit', 'reference-transaction']) {
      const hookPath = path.join(h.workspaceRoot, '.git', 'hooks', hookName);
      fs.writeFileSync(hookPath, hookBody, 'utf8');
      fs.chmodSync(hookPath, 0o755);
    }
    const gpgScript = path.join(h.workspaceRoot, 'gpg-marker.cmd');
    fs.writeFileSync(gpgScript, '@echo off\r\necho gpg>forbidden-execution.marker\r\nexit /b 1\r\n');
    git(h.workspaceRoot, ['config', 'filter.evil.clean', 'echo filter > forbidden-execution.marker']);
    git(h.workspaceRoot, ['config', 'filter.evil.smudge', 'echo smudge > forbidden-execution.marker']);
    git(h.workspaceRoot, ['config', 'filter.evil.process', 'echo process > forbidden-execution.marker']);
    git(h.workspaceRoot, ['config', 'core.fsmonitor', 'echo fsmonitor > forbidden-execution.marker']);
    git(h.workspaceRoot, ['config', 'commit.gpgSign', 'true']);
    git(h.workspaceRoot, ['config', 'gpg.program', gpgScript]);
    git(h.workspaceRoot, ['config', 'credential.helper', '!echo helper > forbidden-execution.marker']);
    git(h.workspaceRoot, ['config', 'alias.status', '!echo alias > forbidden-execution.marker']);
    git(h.workspaceRoot, ['remote', 'add', 'origin', 'ext::sh -c "echo remote > forbidden-execution.marker"']);
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), 'hardened-change\n');

    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    expect(fs.existsSync(marker)).toBe(false);
    kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    expect(fs.existsSync(marker)).toBe(false);
    const checkpoint = requireCreatedCheckpoint(kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: status.statusId })));
    expect(checkpoint.created).toBe(true);
    expect(fs.existsSync(marker)).toBe(false);
  }, 30_000);

  it('keeps diff/file content, credential values, raw Git commands, env, and host paths out of audit', async () => {
    const h = await makeHarness();
    const marker = 'AUDIT_CONTENT_MUST_NOT_APPEAR';
    fs.writeFileSync(path.join(h.workspaceRoot, 'tracked.txt'), `${marker}\n`);
    const status = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    kernelValue<GitDiffResult>(await h.invoke('git.diff', {}));
    kernelValue<GitCheckpointResult>(await h.invoke('git.checkpoint', { expectedStatusId: status.statusId }));
    const serialized = JSON.stringify(h.auditRepo.list(50));
    expect(serialized).not.toContain(marker);
    expect(serialized).not.toContain(h.workspaceRoot);
    expect(serialized).not.toMatch(/GIT_INDEX_FILE|hash-object|update-ref|commit-tree|--no-filters/i);
    expect(h.auditRepo.list(50).some((event) => event.action === 'tool_kernel.invoke' && event.metadata.capability === 'git.checkpoint' && event.resultCode === 'EXECUTED')).toBe(true);

    fs.writeFileSync(path.join(h.workspaceRoot, '.env.local'), 'AUDIT_SECRET=never-audit\n');
    const credentialStatus = kernelValue<GitStatusResult>(await h.invoke('git.status', {}));
    const blocked = await h.invoke('git.checkpoint', { expectedStatusId: credentialStatus.statusId });
    expect(blocked).toMatchObject({ ok: false, code: 'APPROVAL_REQUIRED' });
    expect(JSON.stringify(h.auditRepo.list(50))).not.toContain('never-audit');
  }, 25_000);
});
