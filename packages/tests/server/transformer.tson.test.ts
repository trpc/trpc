import {
  CreateClientCallback,
  routerToServerAndClientNew,
} from './___testHelpers';
import { DataTransformer, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { tsonBigint, tsonDate, tsonMap, tsonSet } from './tson/handlers';
import { tsonDeserializer, tsonSerializer } from './tson/tson';
import { TsonOptions } from './tson/types';

const randomString = () => `_${Math.random().toString(36).slice(2)}`;

function setup(types: TsonOptions['types']) {
  const tsonOpts: TsonOptions = {
    types,
    nonce: randomString,
  };
  const transformer: DataTransformer = {
    serialize: tsonSerializer(tsonOpts),
    deserialize: tsonDeserializer(tsonOpts),
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
    Date: tsonDate,
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
    Map: tsonMap,
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
    Set: tsonSet,
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
    bigint: tsonBigint,
    Set: tsonSet,
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
