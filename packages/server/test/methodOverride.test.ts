import { routerToServerAndClient } from './__testHelpers';
import { IncomingMessage } from 'http';
import { z } from 'zod';
import * as trpc from '../src';

type Context = { method: 'GET' | 'POST' };

const createContext = ({ req }: { req: IncomingMessage }): Context => {
  return { method: req.method! as Context['method'] };
};

const router = trpc
  .router<Context>()
  .query('query', {
    input: z.string(),
    resolve: ({ ctx, input }) => {
      return {
        type: 'query',
        method: ctx.method,
        payload: input,
      };
    },
  })
  .mutation('mutation', {
    input: z.string(),
    resolve: ({ ctx, input }) => {
      return {
        type: 'mutation',
        method: ctx.method,
        payload: input,
      };
    },
  });

test('query as GET', async () => {
  const { client, close } = routerToServerAndClient(router, {
    server: { createContext },
  });

  {
    const res = await client.query('query', 'query-GET', {
      method: 'GET',
    });
    expect(res).toEqual({
      type: 'query',
      method: 'GET',
      payload: 'query-GET',
    });
  }
  {
    const res = await client.query('query', 'query-undefined');
    expect(res).toEqual({
      type: 'query',
      method: 'GET',
      payload: 'query-undefined',
    });
  }

  close();
});

test('query as POST', async () => {
  const { client, close } = routerToServerAndClient(router, {
    server: { createContext },
  });

  {
    const res = await client.query('query', 'query-POST', {
      method: 'POST',
    });
    expect(res).toEqual({
      type: 'query',
      method: 'POST',
      payload: 'query-POST',
    });
  }

  close();
});

test('mutation as GET', async () => {
  const { client, close } = routerToServerAndClient(router, {
    server: { createContext },
  });

  {
    const res = await client.mutation('mutation', 'mutation-GET', {
      method: 'GET',
    });
    expect(res).toEqual({
      type: 'mutation',
      method: 'GET',
      payload: 'mutation-GET',
    });
  }

  close();
});

test('mutation as POST', async () => {
  const { client, close } = routerToServerAndClient(router, {
    server: { createContext },
  });

  {
    const res = await client.mutation('mutation', 'mutation-POST', {
      method: 'POST',
    });
    expect(res).toEqual({
      type: 'mutation',
      method: 'POST',
      payload: 'mutation-POST',
    });
  }
  {
    const res = await client.mutation('mutation', 'mutation-undefined');
    expect(res).toEqual({
      type: 'mutation',
      method: 'POST',
      payload: 'mutation-undefined',
    });
  }

  close();
});
