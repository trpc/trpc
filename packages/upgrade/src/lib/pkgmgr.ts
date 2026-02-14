import { log } from '@clack/prompts';
import { execa } from './execa';

type PackageManager = 'pnpm' | 'yarn' | 'bun' | 'npm';

const packageManagerCommands: Record<
  PackageManager,
  { install: string; uninstall: string }
> = {
  pnpm: { install: 'add', uninstall: 'remove' },
  yarn: { install: 'add', uninstall: 'remove' },
  bun: { install: 'add', uninstall: 'remove' },
  npm: { install: 'install', uninstall: 'uninstall' },
};

function getPackageManager(): PackageManager {
  const userAgent = process.env['npm_config_user_agent'];
  if (userAgent?.startsWith('pnpm')) return 'pnpm';
  if (userAgent?.startsWith('yarn')) return 'yarn';
  if (userAgent?.startsWith('bun')) return 'bun';
  return 'npm';
}

export async function installPackage(packageName: string) {
  const packageManager = getPackageManager();
  const installCmd = packageManagerCommands[packageManager].install;
  const { stdout, stderr } = await execa(
    `${packageManager} ${installCmd} ${packageName}`,
  );
  if (stderr) {
    log.error(stderr);
  }
  if (process.env['VERBOSE']) {
    log.info(stdout);
  }
}

export async function uninstallPackage(packageName: string) {
  const packageManager = getPackageManager();
  const uninstallCmd = packageManagerCommands[packageManager].uninstall;
  const { stdout, stderr } = await execa(
    `${packageManager} ${uninstallCmd} ${packageName}`,
  );
  if (stderr) {
    log.error(stderr);
  }
  if (process.env['VERBOSE']) {
    log.info(stdout);
  }
}
