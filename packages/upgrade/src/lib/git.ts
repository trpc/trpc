import { resolve } from 'path';
import { cancel, log } from '@clack/prompts';
import type { SourceFile } from 'typescript';
import { execa } from './execa';

export async function assertCleanGitTree() {
  const { stdout } = await execa('git status');
  if (!stdout.includes('nothing to commit')) {
    cancel(
      'Git tree is not clean, please commit your changes and try again, or run with `--force`',
    );
    process.exit(1);
  }
}

export async function filterIgnored(files: readonly SourceFile[]) {
  const { stdout } = await execa('git check-ignore **/*');
  const ignores = stdout.split('\n');

  if (process.env['VERBOSE']) {
    log.info(`cwd: ${process.cwd()}`);
    log.info(
      `All files in program: ${files.map((file) => file.fileName).join(', ')}`,
    );
    log.info(`Ignored files: ${ignores.join(', ')}`);
  }

  // Ignore "common files"
  const filteredSourcePaths = files
    .filter(
      (source) =>
        source.fileName.startsWith(resolve()) && // only look ahead of current directory
        !source.fileName.includes('/trpc/packages/') && // relative paths when running codemod locally
        !source.fileName.includes('/node_modules/') && // always ignore node_modules
        !ignores.includes(source.fileName), // ignored files
    )
    .map((source) => source.fileName);

  if (process.env['VERBOSE']) {
    log.info(`Filtered files: ${filteredSourcePaths.join(', ')}`);
  }

  return filteredSourcePaths;
}
