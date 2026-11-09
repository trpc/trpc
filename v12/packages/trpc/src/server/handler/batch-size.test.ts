import { httpLink } from '@trpc12/trpc/client';
import { createV11Handler } from '@trpc12/trpc/interop';
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';

const t = initTrpc();
const router = t.router({ hello: t.procedure.query(() => 'hi') });

const invalid: ReadonlyArray<[unknown, string]> = [
  [true, 'true'],
  [{}, '{ maxItems: undefined }'],
  [{ maxItems: 0 }, '{ maxItems: 0 }'],
  [{ maxItems: 2.5 }, '{ maxItems: 2.5 }'],
  [{ maxItems: Infinity }, '{ maxItems: Infinity }'],
  [{ maxItems: '10' }, '{ maxItems: "10" }'],
  ['yes', '"yes"'],
];

const message = (owner: string, got: string) =>
  `${owner}: batch is false or { maxItems }, a positive integer capping the calls in one batch (batch: { maxItems: 100 }); got ${got}`;

test.each(invalid)(
  'createFetchHandler refuses batch %j: batching needs an explicit maxItems',
  (batch, got) => {
    expect(() => createFetchHandler({ router, batch: batch as never })).toThrow(
      new TypeError(message('createFetchHandler', got)),
    );
  },
);

test.each(invalid)(
  'createV11Handler refuses batch %j: batching needs an explicit maxItems',
  (batch, got) => {
    expect(() => createV11Handler({ router, batch: batch as never })).toThrow(
      new TypeError(message('createV11Handler', got)),
    );
  },
);

test('createV11Handler refuses a missing batch, since v11 links batch by default', () => {
  expect(() => createV11Handler({ router } as never)).toThrow(
    new TypeError(message('createV11Handler', 'no batch')),
  );
});

test.each(invalid)(
  'httpLink refuses batch %j: batching needs an explicit maxItems',
  (batch, got) => {
    expect(() =>
      httpLink({ url: 'http://localhost/trpc', batch: batch as never }),
    ).toThrow(new TypeError(message('httpLink', got)));
  },
);

test('false, or a positive integer maxItems, is accepted', async () => {
  await using off = createFetchHandler({ router, batch: false });
  await using on = createFetchHandler({ router, batch: { maxItems: 1 } });
  await using legacy = createV11Handler({ router, batch: false });
  await using capped = createV11Handler({ router, batch: { maxItems: 1 } });
  httpLink({ url: 'http://localhost/trpc', batch: false });
  httpLink({ url: 'http://localhost/trpc', batch: { maxItems: 1 } });
  expect([off, on, legacy, capped]).toHaveLength(4);
});
