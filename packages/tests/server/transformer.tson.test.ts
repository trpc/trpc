import {
  CreateClientCallback,
  routerToServerAndClientNew,
} from './___testHelpers';
import { DataTransformer, initTRPC } from '@trpc/server';
import { z } from 'zod';
import { DateHandler } from './tson/handlers';
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
