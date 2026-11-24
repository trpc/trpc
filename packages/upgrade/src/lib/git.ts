import { spawn } from 'node:child_process';
import { resolve } from 'path';
import { cancel } from '@clack/prompts';
import { execa } from './execa';

/** @internal */
export async function assertCleanGitTree() {
  const { stdout } = await execa('git status');
  if (!stdout.includes('nothing to commit')) {
    cancel(
      'Git tree is not clean, please commit your changes and try again, or run with `--force`',
    );
    process.exit(1);
  }
}

/**
 * The environment without variables that point git at another repository,
 * e.g. `GIT_DIR` from a hook, so `cwd` decides which repository git reads.
 * @internal
 */
export function isolatedGitEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const name of [
    'GIT_DIR',
    'GIT_WORK_TREE',
    'GIT_INDEX_FILE',
    'GIT_COMMON_DIR',
    'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES',
    'GIT_NAMESPACE',
    'GIT_PREFIX',
  ]) {
    delete env[name];
  }
  return env;
}

/**
 * Every file under `cwd` that git tracks, or would track because no ignore
 * rule matches it, as absolute paths. Leaves out `node_modules`, build output
 * and generated code. Reads git's output as a stream, so no buffer limit
 * stops a big repository.
 * @internal
 */
export function projectFiles(cwd: string): Promise<string[]> {
  return new Promise((done, fail) => {
    const args = [
      'ls-files',
      '-z',
      '--cached',
      '--others',
      '--exclude-standard',
    ];
    const child = spawn('git', args, {
      cwd,
      env: isolatedGitEnv(),
    });
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
