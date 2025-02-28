import { log } from '@clack/prompts';
import { execa } from './execa';

function getPackageManager() {
  const userAgent = process.env['npm_config_user_agent'];
  if (userAgent?.startsWith('pnpm')) return 'pnpm';
  if (userAgent?.startsWith('yarn')) return 'yarn';
  if (userAgent?.startsWith('bun')) return 'bun';
  return 'npm';
}

export async function installPackage(packageName: string) {
  const packageManager = getPackageManager();
  const installCmd = packageManager === 'yarn' ? 'add' : 'install';
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
  const uninstallCmd = packageManager === 'yarn' ? 'remove' : 'uninstall';
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
