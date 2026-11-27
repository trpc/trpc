// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { httpLink } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { DataTransformer } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

/**
 * A transformer that, like devalue, throws on anything but plain objects,
 * arrays and primitives.
 */
const plainOnlyTransformer: DataTransformer = {
  serialize(value) {
    if (
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      throw new Error('Cannot serialize a non-plain object');
    }
    return value;
  },
  deserialize: (value) => value,
};

/**
 * `httpLink` sends `FormData` as is, without the transformer. With
 * `methodOverride: 'POST'`, `getUrl` used to run the transformer on a query's
 * input anyway, only to drop the result, so this transformer threw.
 * @see https://github.com/trpc/trpc/pull/8210
 */
test('a POST-overridden query with FormData input skips the transformer', async () => {
  const t = initTRPC.create({ transformer: plainOnlyTransformer });
  const router = t.router({
    upload: t.procedure
      .input(
        z.custom<FormData>(
          // the server-side instance comes from undici, so check the tag
          (input) =>
            Object.prototype.toString.call(input) === '[object FormData]',
        ),
      )
      .query((opts) => `hello ${opts.input.get('name')}`),
  });
  await using ctx = testServerAndClientResource(router, {
    server: { allowMethodOverride: true },
    client: (clientOpts) => ({
      links: [
        httpLink({
          url: clientOpts.httpUrl,
          transformer: plainOnlyTransformer,
          methodOverride: 'POST',
        }),
      ],
    }),
  });

  const formData = new FormData();
  formData.set('name', 'world');
  expect(await ctx.client.upload.query(formData)).toBe('hello world');
});
