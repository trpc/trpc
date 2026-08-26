import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const cliPath = path.resolve(__dirname, '../src/cli.ts');
const tsxPath = path.resolve(__dirname, '../../../node_modules/.bin/tsx');
const routersDir = path.resolve(__dirname, 'routers');
const appRouterPath = path.resolve(routersDir, 'appRouter.ts');
const errorFormatterRouterPath = path.resolve(
  routersDir,
  'errorFormatterRouter.ts',
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

describe('CLI', () => {
  beforeAll(() => {
    fs.mkdirSync(outDir, { recursive: true });
  });

  afterAll(() => {
    fs.rmSync(outDir, { recursive: true, force: true });
  });

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
    const result = runCli([
      appRouterPath,
      '-e',
      'NonExistentExport',
      '-o',
      path.join(outDir, 'bad-export.json'),
    ]);
    expect(result.stderr).toContain('NonExistentExport');
    expect(result.exitCode).not.toBe(0);
  });

  it('generates an OpenAPI document from a router file', () => {
    const outputPath = path.join(outDir, 'cli-test-output.json');

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

  it('uses -e shorthand for --export', () => {
    const outputPath = path.join(outDir, 'cli-export-test.json');

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
    const outputPath = path.join(outDir, 'cli-equals-long.json');

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
    const outputPath = path.join(outDir, 'cli-equals-export.json');

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
    // Run from the isolated outDir so the default "openapi.json" lands there
    const defaultOutput = path.join(outDir, 'openapi.json');

    try {
      execFileSync(tsxPath, [cliPath, appRouterPath], {
        encoding: 'utf8',
        timeout: 60_000,
        cwd: outDir,
      });
    } catch {
      // ignore – we only care about the file
    }

    expect(fs.existsSync(defaultOutput)).toBe(true);
  });
});
