// @vitest-environment node
import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import { waitError } from '@trpc/server/__tests__/waitError';
import { httpBatchLink, httpLink, TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { CombinedDataTransformer } from '@trpc/server/unstable-core-do-not-import';
import { z } from 'zod';

describe('unstable_serializeNonJsonTypes', () => {
  test('serialize() runs on FormData input when flag is true', async () => {
    const serializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize(obj) {
          serializeSpy(obj);
          return obj;
        },
        deserialize: (obj) => obj,
        unstable_serializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure.input(z.instanceof(FormData)).mutation(({ input }) => {
        const data: Record<string, string> = {};
        input.forEach((v, k) => {
          data[k] = String(v);
        });
        return data;
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const result = await (ctx.client.test.mutate as any)(form);
    expect(result).toEqual({ text: 'hello' });
    expect(serializeSpy).toHaveBeenCalledWith(expect.any(FormData));
  });

  test('serialize() runs on Blob input when flag is true', async () => {
    const serializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize(obj) {
          serializeSpy(obj);
          return obj;
        },
        deserialize: (obj) => obj,
        unstable_serializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure
        .input(z.instanceof(ReadableStream))
        .mutation(async ({ input }) => {
          const text = await new Response(input).text();
          return text;
        }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const blob = new Blob(['hello blob']);

    const result = await ctx.client.test.mutate(blob as any);
    expect(result).toEqual('hello blob');
    expect(serializeSpy).toHaveBeenCalledWith(expect.any(Blob));
  });

  test('serialize() runs on Uint8Array input when flag is true', async () => {
    const serializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize(obj) {
          serializeSpy(obj);
          return obj;
        },
        deserialize: (obj) => obj,
        unstable_serializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure
        .input(z.instanceof(ReadableStream))
        .mutation(async ({ input }) => {
          const text = await new Response(input).text();
          return text;
        }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const data = new TextEncoder().encode('hello uint8array');

    const result = await ctx.client.test.mutate(data as any);
    expect(result).toEqual('hello uint8array');
    expect(serializeSpy).toHaveBeenCalledWith(expect.any(Uint8Array));
  });
});

describe('unstable_deserializeNonJsonTypes', () => {
  test('deserialize() runs on FormData when unstable_deserializeNonJsonTypes is true', async () => {
    const deserializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize: (obj) => obj,
        deserialize(obj) {
          deserializeSpy(obj);
          if (obj instanceof FormData) {
            const data: Record<string, string> = {};
            obj.forEach((v, k) => {
              data[k] = String(v);
            });
            return data;
          }
          return obj;
        },
        unstable_deserializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure
        .input(z.object({ text: z.string() }))
        .mutation(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const result = await ctx.client.test.mutate(form as any);
    expect(result).toEqual({ text: 'hello' });
    expect(deserializeSpy).toHaveBeenCalledWith(expect.any(FormData));
  });

  test('deserialize() runs on ReadableStream when unstable_deserializeNonJsonTypes is true', async () => {
    const deserializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize: (obj) => obj,
        deserialize(obj) {
          deserializeSpy(obj);
          return obj;
        },
        unstable_deserializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(async ({ input }) => {
        const text = await new Response(input).text();
        return text;
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const data = new TextEncoder().encode('hello stream');

    const result = await ctx.client.test.mutate(data);
    expect(result).toEqual('hello stream');
    expect(deserializeSpy).toHaveBeenCalledWith(expect.any(ReadableStream));
  });
});

describe('serializer returning non-JSON types', () => {
  describe('serializer returns FormData from plain object input', () => {
    test('FormData from serializer is sent as multipart/form-data and deserialized on server', async () => {
      const transformer: CombinedDataTransformer = {
        input: {
          serialize(obj) {
            const json = JSON.stringify(obj);
            const fd = new FormData();
            fd.set('payload', json);
            return fd;
          },
          deserialize(obj: any) {
            if (obj instanceof FormData) {
              const data = obj.get('payload');
              if (typeof data === 'string') {
                return JSON.parse(data);
              }
            }
            return obj;
          },
          unstable_deserializeNonJsonTypes: true,
        },
        output: {
          serialize: (obj) => obj,
          deserialize: (obj) => obj,
        },
      };

      const t = initTRPC.create({ transformer });
      const router = t.router({
        test: t.procedure
          .input(z.object({ text: z.string() }))
          .mutation(({ input }) => input),
      });

      await using ctx = testServerAndClientResource(router, {
        client({ httpUrl }) {
          return {
            links: [httpLink({ url: httpUrl, transformer })],
          };
        },
      });

      const result = await ctx.client.test.mutate({ text: 'hello' });
      expect(result).toEqual({ text: 'hello' });
    });
  });
});

describe('batch link rejects FormData and octet types', () => {
  test('httpBatchLink throws when FormData input is used (serializeNonJsonTypes=false)', async () => {
    const t = initTRPC.create();
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl })],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const error = await waitError(
      (ctx.client.test.mutate as any)(form),
      TRPCClientError,
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Batch link does not support FormData or Octet type inputs, use httpLink"`,
    );
  });

  test('httpBatchLink throws when Uint8Array input is used (serializeNonJsonTypes=false)', async () => {
    const t = initTRPC.create();
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl })],
        };
      },
    });

    const data = new Uint8Array([1, 2, 3]);

    const error = await waitError(
      (ctx.client.test.mutate as any)(data),
      TRPCClientError,
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Batch link does not support FormData or Octet type inputs, use httpLink"`,
    );
  });

  test('httpBatchLink throws when serializer output is FormData', async () => {
    const transformer: CombinedDataTransformer = {
      input: {
        serialize(obj: any) {
          // Convert plain object to FormData
          const fd = new FormData();
          for (const [k, v] of Object.entries(obj)) {
            fd.set(k, String(v));
          }
          return fd;
        },
        deserialize: (obj) => obj,
        unstable_serializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl, transformer })],
        };
      },
    });

    const error = await waitError(
      ctx.client.test.mutate({ text: 'hello' }),
      TRPCClientError,
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Batch link does not support FormData or Octet type inputs, use httpLink"`,
    );
  });

  test('httpBatchLink throws when serializer output is Uint8Array', async () => {
    const transformer: CombinedDataTransformer = {
      input: {
        serialize(obj: any) {
          return new TextEncoder().encode(JSON.stringify(obj));
        },
        deserialize: (obj) => obj,
        unstable_serializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpBatchLink({ url: httpUrl, transformer })],
        };
      },
    });

    const error = await waitError(
      ctx.client.test.mutate({ text: 'hello' }),
      TRPCClientError,
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Batch link does not support FormData or Octet type inputs, use httpLink"`,
    );
  });
});

describe('FormData/octet with queries', () => {
  test('FormData query with methodOverride=POST works', async () => {
    const transformer: CombinedDataTransformer = {
      input: {
        serialize: (obj) => obj,
        deserialize(obj: any) {
          if (obj instanceof FormData) {
            const data: Record<string, string> = {};
            obj.forEach((v, k) => {
              data[k] = String(v);
            });
            return data;
          }
          return obj;
        },
        unstable_deserializeNonJsonTypes: true,
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure
        .input(z.object({ text: z.string() }))
        .query(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      server: {
        allowMethodOverride: true,
      },
      client({ httpUrl }) {
        return {
          links: [
            httpLink({ url: httpUrl, transformer, methodOverride: 'POST' }),
          ],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const result = await (ctx.client.test.query as any)(form);
    expect(result).toEqual({ text: 'hello' });
  });

  test('FormData query without methodOverride throws', async () => {
    const t = initTRPC.create();
    const router = t.router({
      test: t.procedure.input(z.any()).query(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl })],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const error = await waitError(
      (ctx.client.test.query as any)(form),
      TRPCClientError,
    );
    expect(error.message).toMatchInlineSnapshot(
      `"FormData is only supported for mutations, or when using POST methodOverride"`,
    );
  });

  test('Uint8Array query without methodOverride throws', async () => {
    const t = initTRPC.create();
    const router = t.router({
      test: t.procedure.input(z.any()).query(({ input }) => input),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl })],
        };
      },
    });

    const data = new Uint8Array([1, 2, 3]);

    const error = await waitError(
      (ctx.client.test.query as any)(data),
      TRPCClientError,
    );
    expect(error.message).toMatchInlineSnapshot(
      `"Octet type is only supported for mutations, or when using POST methodOverride"`,
    );
  });
});

describe('default behavior', () => {
  test('FormData bypasses serializer when unstable_serializeNonJsonTypes is not set', async () => {
    const serializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize(obj) {
          serializeSpy(obj);
          return obj;
        },
        deserialize: (obj) => obj,
        // unstable_serializeNonJsonTypes not set (defaults to false)
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(({ input }) => {
        expect(input).toBeInstanceOf(FormData);
        return { text: input.get('text') };
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const result = await ctx.client.test.mutate(form);
    expect(result).toEqual({ text: 'hello' });
    // serialize should NOT have been called with FormData
    expect(serializeSpy).not.toHaveBeenCalled();
  });

  test('FormData bypasses server deserializer when unstable_deserializeNonJsonTypes is not set', async () => {
    const deserializeSpy = vi.fn();
    const transformer: CombinedDataTransformer = {
      input: {
        serialize: (obj) => obj,
        deserialize(obj) {
          deserializeSpy(obj);
          return obj;
        },
        // unstable_deserializeNonJsonTypes not set (defaults to false)
      },
      output: {
        serialize: (obj) => obj,
        deserialize: (obj) => obj,
      },
    };

    const t = initTRPC.create({ transformer });
    const router = t.router({
      test: t.procedure.input(z.any()).mutation(({ input }) => {
        expect(input).toBeInstanceOf(FormData);
        return { text: input.get('text') };
      }),
    });

    await using ctx = testServerAndClientResource(router, {
      client({ httpUrl }) {
        return {
          links: [httpLink({ url: httpUrl, transformer })],
        };
      },
    });

    const form = new FormData();
    form.set('text', 'hello');

    const result = await ctx.client.test.mutate(form);
    expect(result).toEqual({ text: 'hello' });
    // input.deserialize should not have been called at all
    expect(deserializeSpy).not.toHaveBeenCalled();
  });
});
