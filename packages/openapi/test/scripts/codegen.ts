/* eslint-disable no-console */
/**
 * Generates hey-api SDK clients from all router files in test/routers/.
 * Used by both vitest globalSetup and the postinstall script.
 *
 * Convention: each router file `fooBar.ts` must export a router named `FooBar`
 * (filename stem with first letter uppercased). The generated hey-api client
 * is output to `fooBar-heyapi/` alongside the source file.
 */
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@hey-api/openapi-ts';
import { createTRPCHeyApiTypeResolvers } from '@trpc/openapi/heyapi';
import { generateOpenAPIDocument } from '../../src/generate';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageDir = path.resolve(__dirname, '..', '..');
const routersDir = path.resolve(__dirname, '..', 'routers');
const srcDir = path.resolve(packageDir, 'src');
const packageJsonPath = path.resolve(packageDir, 'package.json');
const cacheDir = path.resolve(packageDir, 'test', '.cache');
const cacheFilePath = path.resolve(cacheDir, 'codegen.json');
const CACHE_VERSION = 1;

type CodegenCache = {
  version: number;
  routers: Record<string, string>;
};

function getExportName(stem: string): string {
  return stem.charAt(0).toUpperCase() + stem.slice(1);
}

function listFilesRecursively(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const entryPath = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        return listFilesRecursively(entryPath);
      }

      return entryPath;
    });
}

function getRouterFiles(): string[] {
  return readdirSync(routersDir)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
    .sort()
    .map((file) => path.resolve(routersDir, file));
}

function hashFiles(paths: string[]): string {
  const hash = createHash('sha256');

  for (const filePath of paths) {
    hash.update(path.relative(packageDir, filePath));
    hash.update('\0');
    hash.update(readFileSync(filePath));
    hash.update('\0');
  }

  return hash.digest('hex');
}

function getSharedInputPaths(): string[] {
  return [packageJsonPath, ...listFilesRecursively(srcDir)];
}

function getRouterInputsHash(
  routerPath: string,
  sharedInputPaths: string[],
): string {
  return hashFiles([...sharedInputPaths, routerPath]);
}

function readCache(): CodegenCache | null {
  try {
    return JSON.parse(readFileSync(cacheFilePath, 'utf8')) as CodegenCache;
  } catch {
    return null;
  }
}

function writeCache(cache: CodegenCache): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2) + '\n');
}

export async function codegen() {
  const sharedInputPaths = getSharedInputPaths();
  const routerFiles = getRouterFiles();
  const existingCache = readCache();
  const nextCache: CodegenCache = {
    version: CACHE_VERSION,
    routers: {},
  };

  for (const file of routerFiles) {
    const stem = path.basename(file, '.ts');
    const exportName = getExportName(stem);
    const routerPath = path.resolve(routersDir, file);
    const outputDir = path.resolve(routersDir, `${stem}-heyapi`);
    const routerInputsHash = getRouterInputsHash(routerPath, sharedInputPaths);

    nextCache.routers[stem] = routerInputsHash;

    if (
      existingCache?.version === CACHE_VERSION &&
      existingCache.routers[stem] === routerInputsHash
    ) {
      console.log(`[openapi codegen] Cache hit for ${file}, skipping`);
      continue;
    }

    rmSync(outputDir, { recursive: true, force: true });

    const doc = await generateOpenAPIDocument(routerPath, { exportName });
    const docPath = path.resolve(routersDir, `${stem}.ts.json`);
    writeFileSync(docPath, JSON.stringify(doc, null, 2) + '\n');

    await createClient({
      input: docPath,
      output: outputDir,
      plugins: [
        {
          name: '@hey-api/typescript',
          '~resolvers': createTRPCHeyApiTypeResolvers(),
        },
        {
          name: '@hey-api/sdk',
          operations: { strategy: 'single' },
        },
      ],
      logs: { level: 'error' },
    });
  }

  writeCache(nextCache);
}
