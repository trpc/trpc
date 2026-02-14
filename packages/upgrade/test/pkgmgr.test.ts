import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execaMock, errorMock, infoMock } = vi.hoisted(() => ({
  execaMock: vi.fn(),
  errorMock: vi.fn(),
  infoMock: vi.fn(),
}));

vi.mock('../src/lib/execa', () => ({
  execa: execaMock,
}));

vi.mock('@clack/prompts', () => ({
  log: {
    error: errorMock,
    info: infoMock,
  },
}));

import { installPackage, uninstallPackage } from '../src/lib/pkgmgr';

describe('pkgmgr command mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env['npm_config_user_agent'];
    delete process.env['VERBOSE'];
  });

  it.each([
    {
      userAgent: 'pnpm/10.12.0',
      installCommand: 'pnpm add pkg-a',
      uninstallCommand: 'pnpm remove pkg-a',
    },
    {
      userAgent: 'yarn/4.5.0',
      installCommand: 'yarn add pkg-a',
      uninstallCommand: 'yarn remove pkg-a',
    },
    {
      userAgent: 'bun/1.2.22',
      installCommand: 'bun add pkg-a',
      uninstallCommand: 'bun remove pkg-a',
    },
    {
      userAgent: undefined,
      installCommand: 'npm install pkg-a',
      uninstallCommand: 'npm uninstall pkg-a',
    },
  ])(
    'uses correct commands for user-agent %j',
    async ({ userAgent, installCommand, uninstallCommand }) => {
      execaMock.mockResolvedValue({ stdout: '', stderr: '' });

      if (userAgent) {
        process.env['npm_config_user_agent'] = userAgent;
      } else {
        delete process.env['npm_config_user_agent'];
      }

      await installPackage('pkg-a');
      await uninstallPackage('pkg-a');

      expect(execaMock).toHaveBeenNthCalledWith(1, installCommand);
      expect(execaMock).toHaveBeenNthCalledWith(2, uninstallCommand);
    },
  );

  it('logs stderr when subprocess emits errors', async () => {
    process.env['npm_config_user_agent'] = 'pnpm/10.12.0';
    execaMock.mockResolvedValue({
      stdout: 'ok',
      stderr: 'failed to install dependency',
    });

    await installPackage('pkg-a');

    expect(errorMock).toHaveBeenCalledWith('failed to install dependency');
    expect(infoMock).not.toHaveBeenCalled();
  });

  it('logs stdout in verbose mode', async () => {
    process.env['npm_config_user_agent'] = 'pnpm/10.12.0';
    process.env['VERBOSE'] = '1';
    execaMock.mockResolvedValue({ stdout: 'installed', stderr: '' });

    await installPackage('pkg-a');

    expect(infoMock).toHaveBeenCalledWith('installed');
  });
});
