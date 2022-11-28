import { routerToServerAndClientNew } from '../../___testHelpers';
import { createQueryClient } from '../__queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { createReactQueryHooks, httpBatchLink } from '@trpc/react-query/src';
import * as interop from '@trpc/server/src';
import { inferProcedureOutput, initTRPC } from '@trpc/server/src';
import { expectTypeOf } from 'expect-type';
import { konn } from 'konn';
import React, { useState } from 'react';
import superjson from 'superjson';
import { z } from 'zod';

type Context = {
  foo: 'bar';
};

describe('transformer on legacy router', () => {
  const ctx = konn()
    .beforeEach(() => {
      const t = initTRPC.context<Context>().create();
      const legacyRouter = interop
        .router<Context>()
        .transformer(superjson)
        .query('oldQuery', {
          resolve() {
            return {
              date: new Date(),
            };
          },
        })
        .mutation('oldMutation', {
          resolve() {
            return {
              date: new Date(),
            };
          },
        });

      const newAppRouter = t.router({
        newProcedure: t.procedure.query(() => {
          date: new Date();
        }),
      });

      const appRouter = t.mergeRouters(legacyRouter.interop(), newAppRouter);

      const opts = routerToServerAndClientNew(appRouter, {
        server: {
          createContext() {
            return {
              foo: 'bar',
            };
          },
        },
        client({ httpUrl }) {
          return {
            transformer: superjson,
            links: [
              httpBatchLink({
                url: httpUrl,
              }),
            ],
          };
        },
      });
      return {
        ...opts,
        appRouter,
      };
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();

  test('call old', async () => {
    {
      const res = await ctx.client.query('oldQuery');
      expectTypeOf(res.date).toEqualTypeOf<Date>();
    }
    {
      const res = await ctx.client.mutation('oldMutation');
      expectTypeOf(res.date).toEqualTypeOf<Date>();
    }
  });
});
