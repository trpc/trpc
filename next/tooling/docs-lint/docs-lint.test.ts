import { fileURLToPath } from 'node:url';
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { expect, test } from 'vite-plus/test';
import { codeBlocks, lintDocs, markdownPaths } from './docs-lint.ts';

const page = fileURLToPath(new URL('fixtures/page.md', import.meta.url));

test('codeBlocks keeps the Markdown lines and columns of each block', () => {
  const blocks = codeBlocks(
    [
      'Intro',
      '```ts',
      'const a = 1;',
      '```',
      '',
      '  ```tsx',
      '  <b />;',
      '  ```',
      '````md',
      '```ts',
      'hidden;',
      '```',
      '````',
      '```sh',
      'echo',
      '```',
    ].join('\n'),
  );
  expect(blocks).toEqual([
    { line: 3, extension: 'ts', code: 'const a = 1;' },
    { line: 7, extension: 'tsx', code: '  <b />;' },
  ]);
});

test('codeBlocks splits a twoslash block at each // @filename:', () => {
  const blocks = codeBlocks(
    [
      '```ts twoslash',
      '// @filename: server.ts',
      'const a = 1;',
      '// @filename: client.tsx',
      '<b />;',
      '```',
    ].join('\n'),
  );
  expect(blocks).toEqual([
    { line: 2, extension: 'ts', code: '// @filename: server.ts\nconst a = 1;' },
    { line: 4, extension: 'tsx', code: '// @filename: client.tsx\n<b />;' },
  ]);
});

test('codeBlocks skips a twoslash file that is not code', () => {
  const blocks = codeBlocks(
    [
      '```ts twoslash',
      '// @filename: openapi.json',
      '{ "openapi": "3.1.0" }',
      '// @filename: scripts/openapi.ts',
      'const a = 1;',
      '```',
    ].join('\n'),
  );
  expect(blocks).toEqual([
    {
      line: 4,
      extension: 'ts',
      code: '// @filename: scripts/openapi.ts\nconst a = 1;',
    },
  ]);
});

test('markdownPaths maps a block file back to its page', () => {
  expect(markdownPaths('docs/server/effect.md.3.ts:48:22: error')).toBe(
    'docs/server/effect.md:48:22: error',
  );
  expect(markdownPaths(',-[docs/a.md.12.tsx:1:1]')).toBe(',-[docs/a.md:1:1]');
});

test('lintDocs reports overzealous destructuring and unparseable blocks at their Markdown lines', async () => {
  const result = await Effect.runPromise(
    lintDocs([page], 'unix').pipe(Effect.provide(NodeServices.layer)),
  );
  expect(result.exitCode).toBe(1);
  const problems = [
    ...result.output.matchAll(
      /^tooling\/docs-lint\/fixtures\/page\.md:(\d+:\d+): .* \[Error\/?(.*)\]$/gm,
    ),
  ].map((match) => `${match[1]} ${match[2] || 'parse error'}`);
  expect(problems.sort()).toEqual([
    '20:20 trpc(no-overzealous-destructuring)',
    '43:9 trpc(no-overzealous-destructuring)',
    '52:1 parse error',
    '8:22 trpc(no-overzealous-destructuring)',
  ]);
});

test('lintDocs reports bare code in the prose at its Markdown lines', async () => {
  const prose = fileURLToPath(new URL('fixtures/prose.md', import.meta.url));
  const result = await Effect.runPromise(
    lintDocs([prose], 'unix').pipe(Effect.provide(NodeServices.layer)),
  );
  expect(result.exitCode).toBe(1);
  expect(result.output.split('\n')).toEqual([
    'tooling/docs-lint/fixtures/prose.md:3:32: `ctx` is an identifier: put it in backticks (pnpm lint:docs --fix) [Error/docs(bare-code)]',
    'tooling/docs-lint/fixtures/prose.md:3:41: `t.concat()` is a call: put it in backticks (pnpm lint:docs --fix) [Error/docs(bare-code)]',
    'tooling/docs-lint/fixtures/prose.md:6:24: `@trpc12/trpc/server` is a package or import path: put it in backticks (pnpm lint:docs --fix) [Error/docs(bare-code)]',
  ]);
});
