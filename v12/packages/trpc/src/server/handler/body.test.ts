import { Effect, Stream } from 'effect';
import type { HttpServerRequest } from 'effect/http';
import { safe } from '@trpc12/trpc/client';
import {
  createRouterClient,
  experimental_byteStream,
  initTrpc,
} from '@trpc12/trpc/server';
import { expect, test } from 'vite-plus/test';
import { bodyStream } from './body.ts';

const t = initTrpc();
const encoder = new TextEncoder();

test('a body that fails mid-read fails the stream with BAD_REQUEST', async () => {
  const request = {
    source: {},
    headers: {},
    stream: Stream.concat(
      Stream.make(encoder.encode('a')),
      Stream.fail(new Error('connection reset')),
    ),
  } as unknown as HttpServerRequest.HttpServerRequest;
  const caller = createRouterClient(
    t.router({
      drain: t.procedure
        .input(experimental_byteStream())
        .mutation((opts) => Stream.runDrain(opts.input)),
    }),
  );
  const body = await Effect.runPromise(bodyStream(request));
  const [, err] = await safe(caller.drain.mutate(body));
  expect(err).toMatchObject({
    code: 'BAD_REQUEST',
    message: 'Could not read the byte stream',
    cause: { message: 'connection reset' },
  });
});
