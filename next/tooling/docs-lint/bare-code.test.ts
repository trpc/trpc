import { describe, expect, test } from 'vite-plus/test';
import { bareCode, fixBareCode } from './bare-code.ts';

const texts = (markdown: string) =>
  bareCode(markdown).map((found) => `${found.kind} ${found.text}`);

describe('bareCode', () => {
  test('finds package names, calls, identifiers, members, files and types', () => {
    expect(
      texts(
        [
          'The middleware in @trpc12/trpc/middleware, and @trpc/client@11 too.',
          'Packages that add ctx and meta keys with t.concat(), or .errors().',
          'Pass it to createTrpcClient, then useTrpc(this) and handler.fetch.',
          'Deno.upgradeWebSocket on node:http, with worker_threads and NOT_FOUND.',
          'What experimental_ and unstable_ promise; a ReadableStream<Uint8Array>.',
          'Edit vite.config.ts and ./server.ts, and read [httpLink](./http.md).',
        ].join('\n'),
      ),
    ).toEqual([
      'package @trpc12/trpc/middleware',
      'package @trpc/client@11',
      'identifier ctx',
      'call t.concat()',
      'call .errors()',
      'identifier createTrpcClient',
      'call useTrpc(this)',
      'member handler.fetch',
      'member Deno.upgradeWebSocket',
      'package node:http',
      'identifier worker_threads',
      'identifier NOT_FOUND',
      'identifier experimental_',
      'identifier unstable_',
      'type ReadableStream<Uint8Array>',
      'file vite.config.ts',
      'file ./server.ts',
      'identifier httpLink',
    ]);
  });

  test('leaves prose alone', () => {
    expect(
      texts(
        [
          'tRPC and oRPC run on Next.js, Node.js and trpc.io, e.g. on macOS.',
          'The procedure(s) it calls, a _short_ list, 12 kB and @trpcio on X.',
          'Lambda@Edge, WebSockets, TypeScript, Effect.ts, a devDependency.',
          'Ends with a sentence. Then another one.',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  test('skips code spans, fences, URLs, HTML and link destinations', () => {
    expect(
      texts(
        [
          'Already `@trpc12/trpc` and ``t.concat()``, see https://x.dev/fooBar.ts.',
          '[a page](../server/t.concat.md) and <img alt="x" data-fooBar="1">',
          '<!-- createTrpcClient -->',
          '```ts',
          "import { initTrpc } from '@trpc12/trpc/server';",
          '```',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  test('reads only the prose keys of the frontmatter, at their lines and columns', () => {
    const markdown = [
      '---',
      'title: httpLink',
      'description: Uses t.concat().',
      'v11: client/links/httpBatchLink',
      '---',
      '',
      'The ctx.',
    ].join('\n');
    expect(bareCode(markdown)).toEqual([
      { column: 8, kind: 'identifier', line: 2, text: 'httpLink' },
      { column: 19, kind: 'call', line: 3, text: 't.concat()' },
      { column: 5, kind: 'identifier', line: 7, text: 'ctx' },
    ]);
  });
});

describe('fixBareCode', () => {
  test('puts each find in backticks and quotes the YAML that needs it', () => {
    const fixed = fixBareCode(
      [
        '---',
        'title: httpLink',
        "description: rateLimit() uses Effect's RateLimiter, with t.concat().",
        'label: Plain words',
        '---',
        '',
        'Add [wsLink](./ws.md) to the ctx, via @trpc12/trpc.',
      ].join('\n'),
    );
    expect(fixed).toBe(
      [
        '---',
        "title: '`httpLink`'",
        "description: '`rateLimit()` uses Effect''s RateLimiter, with `t.concat()`.'",
        'label: Plain words',
        '---',
        '',
        'Add [`wsLink`](./ws.md) to the `ctx`, via `@trpc12/trpc`.',
      ].join('\n'),
    );
    expect(bareCode(fixed)).toEqual([]);
  });
});
