// @vitest-environment node
import { mkdtempDisposableSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'tsdown';
import { expect, test } from 'vitest';
import * as client from '../../src';
import * as rsc from '../../src/index.react-server';

const pkgDir = path.join(import.meta.dirname, '../..');

// What `react` exports under the `react-server` condition: no `createContext`,
// `useState`, `useRef` and other client-only APIs
function reactServerExports() {
  const require = createRequire(path.join(pkgDir, 'package.json'));
  const reactDir = path.dirname(require.resolve('react/package.json'));
  return Object.keys(require(path.join(reactDir, 'react.react-server.js')));
}

// #6595: importing the package in a server component failed `next build`
// with "'useRef' is not exported from 'react'", because the `react-server`
// build shared a chunk with the client hooks
test(
  'the react-server build only uses React APIs that react-server exports',
  { timeout: 60_000 },
  async () => {
    using outDir = mkdtempDisposableSync(path.join(tmpdir(), 'trpc-rsc-'));
    await build({
      config: path.join(pkgDir, 'tsdown.config.ts'),
      cwd: pkgDir,
      outDir: outDir.path,
      dts: false,
      logLevel: 'silent',
      // skip writing the package's entrypoints
      onSuccess: () => undefined,
    });

    // Bundle the built entry the way an RSC bundler does: `react` resolves to
    // its `react-server` build and every reference is checked, used or not
    const reactExports = reactServerExports();
    const problems: string[] = [];
    using bundleDir = mkdtempDisposableSync(path.join(tmpdir(), 'trpc-rsc-'));
    await build({
      config: false,
      cwd: pkgDir,
      entry: { rsc: path.join(outDir.path, 'index.react-server.mjs') },
      outDir: bundleDir.path,
      format: 'esm',
      dts: false,
      treeshake: false,
      logLevel: 'warn',
      deps: { alwaysBundle: ['react'] },
      plugins: [
        {
          name: 'react-server-react',
          resolveId: (id) => (id === 'react' ? '\0react' : null),
          load: (id) =>
            id === '\0react'
              ? reactExports
                  .map((name) => `export function ${name}() {}`)
                  .join('\n')
              : null,
        },
      ],
      inputOptions: {
        onLog: (_level, log) => {
          if (
            log.code === 'IMPORT_IS_UNDEFINED' ||
            log.code === 'MISSING_EXPORT'
          ) {
            // the first line names the import; the rest is a code frame
            problems.push(log.message.replace(/\n[\s\S]*/, ''));
          }
        },
      },
    });

    expect(problems).toEqual([]);
  },
);

test('the react-server entry exports the same names as the main entry', () => {
  expect(Object.keys(rsc).sort()).toEqual(Object.keys(client).sort());
});

test('the client-only exports throw when called on the server', () => {
  expect(() => rsc.createTRPCContext()).toThrow(
    '`createTRPCContext` works only in client components',
  );
  expect(() => rsc.useSubscription(null as never)).toThrow(
    '`useSubscription` works only in client components',
  );
});
