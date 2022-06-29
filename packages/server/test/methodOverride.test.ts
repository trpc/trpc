import { routerToServerAndClientNew } from './___testHelpers';
import { z } from 'zod';
import * as trpc from '../src';
import { NodeHTTPRequest } from '../src/adapters/node-http';

const urlMock = jest.fn();

type Context = { method: string };

const createContext = ({ req }: { req: NodeHTTPRequest }): Context => {
  urlMock(req.url);
  return { method: req.method as string };
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
  })
  .interop();

test('query as GET', async () => {
  const { client, close } = routerToServerAndClientNew(router, {
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
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith(
      '/query?batch=1&input=%7B%220%22%3A%22query-GET%22%7D',
    );
    urlMock.mockClear();
  }
  {
    const res = await client.query('query', 'query-undefined');
    expect(res).toEqual({
      type: 'query',
      method: 'GET',
      payload: 'query-undefined',
    });
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith(
      '/query?batch=1&input=%7B%220%22%3A%22query-undefined%22%7D',
    );
    urlMock.mockClear();
  }

  close();
});

test('query as POST', async () => {
  const { client, close } = routerToServerAndClientNew(router, {
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
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith('/query?type=query&batch=1');
    urlMock.mockClear();
  }

  close();
});

test('mutation as GET', async () => {
  const { client, close } = routerToServerAndClientNew(router, {
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
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith(
      '/mutation?type=mutation&batch=1&input=%7B%220%22%3A%22mutation-GET%22%7D',
    );
    urlMock.mockClear();
  }

  close();
});

test('mutation as POST', async () => {
  const { client, close } = routerToServerAndClientNew(router, {
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
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith('/mutation?batch=1');
    urlMock.mockClear();
  }
  {
    const res = await client.mutation('mutation', 'mutation-undefined');
    expect(res).toEqual({
      type: 'mutation',
      method: 'POST',
      payload: 'mutation-undefined',
    });
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith('/mutation?batch=1');
    urlMock.mockClear();
  }

  close();
});

test('with methodOverride disabled', async () => {
  const { client, close } = routerToServerAndClientNew(router, {
    server: { createContext, methodOverride: { enabled: false } },
  });

  {
    await expect(async () => {
      await client.query('query', 'query-POST', { method: 'POST' });
    }).rejects.toThrowError('No "mutation"-procedure on path "query"');
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith('/query?type=query&batch=1');
    urlMock.mockClear();
  }
  {
    await expect(async () => {
      await client.mutation('mutation', 'mutation-GET', { method: 'GET' });
    }).rejects.toThrowError('No "query"-procedure on path "mutation"');
    expect(urlMock).toHaveBeenCalledTimes(1);
    expect(urlMock).toHaveBeenCalledWith(
      '/mutation?type=mutation&batch=1&input=%7B%220%22%3A%22mutation-GET%22%7D',
    );
    urlMock.mockClear();
  }

  close();
});
