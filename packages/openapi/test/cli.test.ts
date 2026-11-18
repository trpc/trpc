import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { makeResource } from '@trpc/server/unstable-core-do-not-import';
import { describe, expect, it } from 'vitest';

const cliPath = path.resolve(__dirname, '../src/cli.ts');
const tsxPath = path.resolve(__dirname, '../../../node_modules/.bin/tsx');
const routersDir = path.resolve(__dirname, 'routers');
const appRouterPath = path.resolve(routersDir, 'appRouter.router.ts');
const errorFormatterRouterPath = path.resolve(
  routersDir,
  'errorFormatterRouter.router.ts',
);

/** Isolated output directory for CLI tests — gitignored via __generated__ prefix. */
const outDir = path.resolve(__dirname, '__generated__');

function runCli(args: string[]): {
  stdout: string;
  stderr: string;
  exitCode: number;
} {
  try {
    const stdout = execFileSync(tsxPath, [cliPath, ...args], {
      encoding: 'utf8',
      timeout: 60_000,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

/** Creates the output directory, and removes it again when disposed. */
function outDirResource() {
  fs.mkdirSync(outDir, { recursive: true });
  return makeResource({ outDir }, () => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });
}

describe('CLI', () => {
  it('shows help with --help', () => {
    const result = runCli(['--help']);
    expect(result.stdout).toContain('trpc-openapi');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('--export');
    expect(result.stdout).toContain('--output');
    expect(result.stdout).toContain('--title');
    expect(result.stdout).toContain('--version');
    expect(result.exitCode).toBe(0);
  });

  it('shows help with -h', () => {
    const result = runCli(['-h']);
    expect(result.stdout).toContain('trpc-openapi');
    expect(result.exitCode).toBe(0);
  });

  it('errors when no router file is provided', () => {
    const result = runCli([]);
    expect(result.stderr).toContain('router-file argument is required');
    expect(result.exitCode).not.toBe(0);
  });

  it('errors when the file does not exist', () => {
    const result = runCli(['/nonexistent/file.ts']);
    expect(result.stderr).toContain('File not found');
    expect(result.exitCode).not.toBe(0);
  });

  it('errors on unknown options', () => {
    const result = runCli(['--unknown-flag']);
    expect(result.stderr).toContain('Unknown option');
    expect(result.exitCode).not.toBe(0);
  });

  it('errors when the export name is not found', () => {
    using dir = outDirResource();
    const result = runCli([
      appRouterPath,
      '-e',
      'NonExistentExport',
      '-o',
      path.join(dir.outDir, 'bad-export.json'),
    ]);
    expect(result.stderr).toContain('NonExistentExport');
    expect(result.exitCode).not.toBe(0);
  });

  it('generates an OpenAPI document from a router file', () => {
    using dir = outDirResource();
    const outputPath = path.join(dir.outDir, 'cli-test-output.json');

    const result = runCli([
      appRouterPath,
      '-o',
      outputPath,
      '--title',
      'CLI Test',
      '--version',
      '2.0.0',
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Generating OpenAPI document');
    expect(result.stdout).toContain('OpenAPI document written to');

    const doc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(doc.openapi).toBe('3.1.1');
    expect(doc.info.title).toBe('CLI Test');
    expect(doc.info.version).toBe('2.0.0');
    expect(doc.paths).toHaveProperty('/greeting');
  });

  it('emits a servers entry with --server-url', () => {
    using dir = outDirResource();
    const outputPath = path.join(dir.outDir, 'cli-server-url.json');

    const result = runCli([
      appRouterPath,
      '-o',
      outputPath,
      '--server-url',
      'https://api.example.com/trpc',
    ]);

    expect(result.exitCode).toBe(0);
    const doc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(doc.servers).toEqual([{ url: 'https://api.example.com/trpc' }]);
  });

  it('omits servers when --server-url is not provided', () => {
    using dir = outDirResource();
    const outputPath = path.join(dir.outDir, 'cli-no-server-url.json');

    const result = runCli([appRouterPath, '-o', outputPath]);

    expect(result.exitCode).toBe(0);
    const doc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(doc.servers).toBeUndefined();
  });

  it('uses -e shorthand for --export', () => {
    using dir = outDirResource();
    const outputPath = path.join(dir.outDir, 'cli-export-test.json');

    const result = runCli([
      errorFormatterRouterPath,
      '-e',
      'ErrorFormatterRouter',
      '-o',
      outputPath,
    ]);

    expect(result.exitCode).toBe(0);
    const doc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(doc.openapi).toBe('3.1.1');
  });

  it('supports --option=value syntax', () => {
    using dir = outDirResource();
    const outputPath = path.join(dir.outDir, 'cli-equals-long.json');

    const result = runCli([
      appRouterPath,
      `--output=${outputPath}`,
      '--title=Equals Test',
      '--version=3.0.0',
    ]);

    expect(result.exitCode).toBe(0);
    const doc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(doc.info.title).toBe('Equals Test');
    expect(doc.info.version).toBe('3.0.0');
  });

  it('supports --long=value with --export', () => {
    using dir = outDirResource();
    const outputPath = path.join(dir.outDir, 'cli-equals-export.json');

    const result = runCli([
      errorFormatterRouterPath,
      `--export=ErrorFormatterRouter`,
      `--output=${outputPath}`,
    ]);

    expect(result.exitCode).toBe(0);
    const doc = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
    expect(doc.openapi).toBe('3.1.1');
  });

  it('uses default output file name when -o is not specified', () => {
    using dir = outDirResource();
    // Run from the isolated outDir so the default "openapi.json" lands there
    const defaultOutput = path.join(dir.outDir, 'openapi.json');

    try {
      execFileSync(tsxPath, [cliPath, appRouterPath], {
        encoding: 'utf8',
        timeout: 60_000,
        cwd: dir.outDir,
      });
    } catch {
      // ignore – we only care about the file
    }

    expect(fs.existsSync(defaultOutput)).toBe(true);
  });
});
