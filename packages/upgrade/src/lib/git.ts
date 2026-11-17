import { spawn } from 'node:child_process';
import { resolve } from 'path';
import { cancel, log } from '@clack/prompts';
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

export async function filterIgnored(files: readonly string[]) {
  let stdout = '';
  let stderr = '';
  try {
    const result = await execa('git check-ignore **/*');
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    log.error('Error executing git check-ignore:' + String(error));
    stdout = '';
  }

  const ignores = stdout.split('\n');

  if (process.env['VERBOSE']) {
    log.info(`cwd: ${process.cwd()}`);
    log.info(`All files in program: ${files.join(', ')}`);
    log.info(`Ignored files: ${ignores.join(', ')}`);
  }

  // Ignore "common files"
  const filteredSourcePaths = files.filter(
    (fileName) =>
      fileName.startsWith(resolve()) && // only look ahead of current directory
      !fileName.includes('/trpc/packages/') && // relative paths when running codemod locally
      !fileName.includes('/node_modules/') && // always ignore node_modules
      !ignores.includes(fileName), // ignored files
  );

  if (process.env['VERBOSE']) {
    log.info(`Filtered files: ${filteredSourcePaths.join(', ')}`);
  }

  return filteredSourcePaths;
}

/**
 * Every file git tracks under `cwd`, as absolute paths. Reads git's output
 * as a stream, so no buffer limit stops a big repository.
 */
export function trackedFiles(cwd: string): Promise<string[]> {
  return new Promise((done, fail) => {
    const child = spawn('git', ['ls-files', '-z'], { cwd });
    const chunks: Buffer[] = [];
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', fail);
    child.on('close', (code) => {
      if (code !== 0) {
        fail(new Error(`git ls-files failed with code ${code}: ${stderr}`));
        return;
      }
      done(
        Buffer.concat(chunks)
          .toString('utf8')
          // `-z`: paths as they are, not quoted and escaped
          .split('\0')
          .filter(Boolean)
          .map((file) => resolve(cwd, file)),
      );
    });
  });
}
