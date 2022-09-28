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

// For some reason this works
/**
 * @internal
 */
export type inferHandlerFn2<TProcedures extends ProcedureRecord> = <
  TPath extends keyof TProcedures & string,
  TProcedure extends TProcedures[TPath],
>(
  path: TPath,
  ...args: inferHandlerInput<TProcedure>
) => Promise<inferProcedureOutput<TProcedure>>;

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

  try {
    const fn: inferHandlerFn<typeof router._def.mutations> = null as any;
    // @ts-expect-error this should fail
    fn('test');
  } catch {
    // do nothing
  }

  try {
    // This should be the same thing but fails for some reason
    const fn: inferHandlerFn2<typeof router._def.mutations> = null as any;
    // @ts-expect-error this should fail
    fn('test');
  } catch {
    // do nothing
  }
  expect(await caller.mutation('test', 'hello world')).toMatchInlineSnapshot();

  expect(await opts.client.mutation('test', 'foo')).toMatchInlineSnapshot(
    `"this is a test"`,
  );
});
