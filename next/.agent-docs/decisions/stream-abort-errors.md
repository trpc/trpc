# A stream that stops fails with the transport's error (agent)

- When the source of a streamed value (a promise or async iterable inside an output) fails with a typed error, that error reaches the client's iterator or promise as is. Aborting the call's `signal` mid-stream rejects with `CLIENT_CLOSED_REQUEST`, every time.
- Other failures still become `DansonError('Stream failed', { cause })`, and an interrupted source with no failure becomes `DansonError('Stream interrupted')`.
- Why: before, an abort sometimes ended the iterator quietly and sometimes rejected with the wrapper, so callers couldn't tell "I stopped it" from "it broke".
- Lost: one error type for every stream failure.
- Lives in: `packages/trpc/src/serializer/stream.ts`; locked by `test/integration/batching-and-streaming.test.ts`.
