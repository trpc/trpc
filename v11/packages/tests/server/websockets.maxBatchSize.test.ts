import { testServerAndClientResource } from '@trpc/client/__tests__/testClientResource';
import type { TRPCClientError } from '@trpc/client';
import { initTRPC } from '@trpc/server';
import type { WSSHandlerOptions } from '@trpc/server/adapters/ws';
import type { TRPCRequestMessage, TRPCResponseMessage } from '@trpc/server/rpc';
import WebSocket from 'ws';

const MAX_BATCH_SIZE = 3;

function factory(opts: { maxBatchSize?: number }) {
  const resolver = vi.fn(() => 'pong');
  const wsOnError = vi.fn<NonNullable<WSSHandlerOptions<any>['onError']>>();

  const t = initTRPC.create();
  const appRouter = t.router({
    ping: t.procedure.query(resolver),
  });

  const ctx = testServerAndClientResource(appRouter, {
    server: {
      maxBatchSize: opts.maxBatchSize,
    },
    wssServer: {
      maxBatchSize: opts.maxBatchSize,
      onError: wsOnError,
    },
    clientLink: 'wsLink',
  });

  return Object.assign(ctx, { resolver, wsOnError });
}

function pingBatch(size: number): TRPCRequestMessage[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index + 1,
    method: 'query',
    params: { path: 'ping', input: undefined },
  }));
}

/**
 * Sends one raw WebSocket message and collects `expected` responses
 */
async function sendRaw(url: string, payload: unknown, expected: number) {
  const ws = new WebSocket(url);
  try {
    return await new Promise<TRPCResponseMessage[]>((resolve, reject) => {
      const responses: TRPCResponseMessage[] = [];
      ws.on('error', reject);
      ws.on('open', () => {
        ws.send(JSON.stringify(payload));
      });
      ws.on('message', (data) => {
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        responses.push(JSON.parse(data.toString()));
        if (responses.length === expected) {
          resolve(responses);
        }
      });
    });
  } finally {
    ws.close();
  }
}

function pickError(res: any) {
  return {
    code: res.error?.code,
    message: res.error?.message,
    dataCode: res.error?.data?.code,
    httpStatus: res.error?.data?.httpStatus,
  };
}

describe('maxBatchSize over WebSockets', () => {
  test('a batch over maxBatchSize is rejected like HTTP, without calling any procedure', async () => {
    await using t = factory({ maxBatchSize: MAX_BATCH_SIZE });
    const size = MAX_BATCH_SIZE + 1;

    const httpRes = await fetch(
      `${t.httpUrl}/${Array(size).fill('ping').join(',')}?batch=1`,
    );
    expect(httpRes.status).toBe(400);
    const httpError = pickError(await httpRes.json());
    expect(httpError).toEqual({
      code: -32600,
      message: 'Batch call exceeds maximum size',
      dataCode: 'BAD_REQUEST',
      httpStatus: 400,
    });

    const responses = await sendRaw(t.wssUrl, pingBatch(size), size);

    expect(responses.map((res) => res.id).sort()).toEqual([1, 2, 3, 4]);
    for (const res of responses) {
      expect(pickError(res)).toEqual(httpError);
    }
    expect(t.resolver).not.toHaveBeenCalled();

    expect(t.wsOnError).toHaveBeenCalledTimes(1);
    expect(t.wsOnError.mock.calls[0]![0]).toMatchObject({
      type: 'unknown',
      path: undefined,
      error: {
        code: 'BAD_REQUEST',
        message: 'Batch call exceeds maximum size',
      },
    });
  });

  test('wsLink calls in an oversized batch reject instead of resolving', async () => {
    await using t = factory({ maxBatchSize: MAX_BATCH_SIZE });

    const results = await Promise.allSettled(
      Array.from({ length: MAX_BATCH_SIZE + 1 }, () => t.client.ping.query()),
    );

    for (const res of results) {
      expect(res.status).toBe('rejected');
      const err = (res as PromiseRejectedResult).reason as TRPCClientError<any>;
      expect(err.data?.code).toBe('BAD_REQUEST');
      expect(err.message).toBe('Batch call exceeds maximum size');
    }
    expect(t.resolver).not.toHaveBeenCalled();
  });

  test('a batch within maxBatchSize is handled', async () => {
    await using t = factory({ maxBatchSize: MAX_BATCH_SIZE });

    const responses = await sendRaw(
      t.wssUrl,
      pingBatch(MAX_BATCH_SIZE),
      MAX_BATCH_SIZE,
    );

    expect(responses.map((res) => res.id).sort()).toEqual([1, 2, 3]);
    for (const res of responses) {
      expect(res).toMatchObject({ result: { type: 'data', data: 'pong' } });
    }
    expect(t.resolver).toHaveBeenCalledTimes(MAX_BATCH_SIZE);
    expect(t.wsOnError).not.toHaveBeenCalled();
  });

  test('without maxBatchSize, large batches are handled', async () => {
    await using t = factory({});
    const size = 50;

    const responses = await sendRaw(t.wssUrl, pingBatch(size), size);

    expect(responses).toHaveLength(size);
    for (const res of responses) {
      expect(res).toMatchObject({ result: { type: 'data', data: 'pong' } });
    }
    expect(t.resolver).toHaveBeenCalledTimes(size);
  });
});
