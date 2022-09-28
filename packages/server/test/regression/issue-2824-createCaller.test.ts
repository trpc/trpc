import { routerToServerAndClientNew } from '../___testHelpers';
import { createTRPCClient } from '@trpc/client';
import * as trpc from '@trpc/server';
import {
  ProcedureRecord,
  inferHandlerInput,
  inferProcedureOutput,
} from '@trpc/server';
import { z } from 'zod';
import { inferHandlerFn } from '../../src/core/router';

test('createCaller', async () => {
  interface Context {
    userId: string;
  }

  const createRouterWithContext = () => trpc.router<Context>();

  const createRouter = createRouterWithContext;

  const legacyRouter = createRouter().mutation('test', {
    input: z.string(),
    resolve: () => 'this is a test',
  });

  const router = legacyRouter.interop();

  const opts = routerToServerAndClientNew(router);

  const caller = opts.router.createCaller({ userId: 'user1' });

  expect(await caller.mutation('test', 'hello world')).toMatchInlineSnapshot(
    `"this is a test"`,
  );

  expect(await opts.client.mutation('test', 'foo')).toMatchInlineSnapshot(
    `"this is a test"`,
  );
});
