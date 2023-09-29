import {
  CreateClientCallback,
  routerToServerAndClientNew,
  waitError,
} from './___testHelpers';
import { TRPCClientError } from '@trpc/client';
import { DataTransformer, initTRPC } from '@trpc/server';
import { z } from 'zod';
import {
  bigintHandler,
  DateHandler,
  MapHandler,
  SetHandler,
} from './tson/handlers';
import { isPlainObject } from './tson/isPlainObject';
import { tsonDecoder, tsonEncoder } from './tson/tson';
import { TsonOptions } from './tson/types';

const randomString = () => `_${Math.random().toString(36).slice(2)}`;

function setup(types: TsonOptions['types']) {
  const tsonOpts: TsonOptions = {
    types,
    nonce: randomString,
  };
  const transformer: DataTransformer = {
    serialize: tsonEncoder(tsonOpts),
    deserialize: tsonDecoder(tsonOpts),
  };

  const t = initTRPC.create({ transformer });

  const clientCallback: CreateClientCallback = () => {
    return {
      transformer,
    };
  };

  return {
    clientCallback,
    router: t.router,
    procedure: t.procedure,
  };
}

test('Date', async () => {
  const t = setup({
    Date: DateHandler,
  });

  const date = new Date();
  const fn = vi.fn();

  const router = t.router({
    hello: t.procedure.input(z.date()).query(({ input }) => {
      fn(input);
      return input;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client: t.clientCallback,
  });

  const res = await proxy.hello.query(date);
  expect(res.getTime()).toBe(date.getTime());
  expect((fn.mock.calls[0]![0]! as Date).getTime()).toBe(date.getTime());

  await close();
});

test('Map', async () => {
  const t = setup({
    Map: MapHandler,
  });

  const expected = new Map([['a', 'b']]);

  const router = t.router({
    test: t.procedure.query(() => {
      return expected;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client: t.clientCallback,
  });

  const res = await proxy.test.query();

  expect(res).toEqual(expected);

  await close();
});

test('Set', async () => {
  const t = setup({
    Set: SetHandler,
  });

  const expected = new Set(['a', 'b']);

  const router = t.router({
    test: t.procedure.query(() => {
      return expected;
    }),
  });

  const { close, proxy } = routerToServerAndClientNew(router, {
    client: t.clientCallback,
  });

  const res = await proxy.test.query();

  expect(res).toEqual(expected);

  await close();
});

test('bigint', async () => {
  const t = setup({
    bigint: bigintHandler,
    Set: SetHandler,
  });

  {
    // bigint
    const expected = 1n;

    const router = t.router({
      test: t.procedure.query(() => {
        return expected;
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router, {
      client: t.clientCallback,
    });

    const res = await proxy.test.query();

    expect(res).toEqual(expected);

    await close();
  }

  {
    // set of BigInt
    const expected = new Set([1n]);

    const router = t.router({
      test: t.procedure.query(() => {
        return expected;
      }),
    });

    const { close, proxy } = routerToServerAndClientNew(router, {
      client: t.clientCallback,
    });

    const res = await proxy.test.query();

    expect(res).toEqual(expected);

    await close();
  }
});

test('guard unwanted', async () => {
  // Sets are okay, but not Maps
  const t = setup({
    Set: SetHandler,
    // defined last so it runs last
    guard: {
      decode: (v) => v,
      encode: (v) => v,
      test(v) {
        if (
          v &&
          typeof v === 'object' &&
          !Array.isArray(v) &&
          !isPlainObject(v)
        ) {
          throw new Error(`Unwanted object found`);
        }
        return false;
      },
    },
  });

  const router = t.router({
    shouldWork1: t.procedure.query(() => {
      return {
        set: new Set([1, 2, 3]),
      };
    }),
    shouldNotWork1: t.procedure.query(() => {
      return new Map([['a', 'b']]);
    }),
    shouldNotWork2: t.procedure
      .input(z.map(z.string(), z.string()))
      .query((opts) => {
        return opts.input;
      }),
  });

  const { close, proxy, httpUrl } = routerToServerAndClientNew(router, {
    client: t.clientCallback,
  });

  expect(await proxy.shouldWork1.query()).toEqual({
    set: new Set([1, 2, 3]),
  });

  {
    // as output
    const err = await waitError(proxy.shouldNotWork1.query());
    assert(err instanceof TRPCClientError);

    expect(err.message).toMatchInlineSnapshot(`"Unwanted object found"`);
    expect(err.data.code).toBe('INTERNAL_SERVER_ERROR');
  }
  {
    // as input

    const err = await waitError(proxy.shouldNotWork2.query(new Map()));
    expect(err.message).toMatchInlineSnapshot(`"Unwanted object found"`);
  }

  await close();
});
