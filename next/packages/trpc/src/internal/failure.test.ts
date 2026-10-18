import { Effect, Predicate } from 'effect';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { TrpcError } from './error.ts';
import { failure, Reason, type Failure, type ReasonOf } from './failure.ts';

const read = (
  body: string,
  limit: number,
): Effect.Effect<unknown, Failure<ReasonOf<'BodyTooLarge' | 'InvalidJson'>>> =>
  body.length > limit
    ? Effect.fail(failure(Reason.BodyTooLarge({ limit })))
    : Effect.try({
        try: () => JSON.parse(body) as unknown,
        catch: (cause) => failure(Reason.InvalidJson(), cause),
      });

test('a failure gets its code and message from its reason', () => {
  const cause = new SyntaxError('Unexpected end of JSON input');
  const err = failure(Reason.InvalidJson(), cause);
  expect(err).toBeInstanceOf(TrpcError);
  expect(err).toMatchObject({
    code: 'PARSE_ERROR',
    message: 'Invalid JSON',
    defined: false,
    cause,
  });
  expect(err.reason).toSatisfy(Predicate.isTagged('InvalidJson'));
  expectTypeOf(err.code).toEqualTypeOf<'PARSE_ERROR'>();

  expect(failure(Reason.ProcedureNotFound({ path: 'post.byId' })).message).toBe(
    'No procedure at path "post.byId"',
  );
  expect(failure(Reason.UndecodableInput(), new Error('Bad tag')).message).toBe(
    'Bad tag',
  );
});

test('an unexpected status takes its code from the status', () => {
  expect(failure(Reason.UnexpectedStatus({ status: 502 })).code).toBe(
    'BAD_GATEWAY',
  );
  expect(failure(Reason.UnexpectedStatus({ status: 418 })).code).toBe(
    'BAD_RESPONSE',
  );
});

test('catchTag on a code narrows the reason, catchReason picks one out', async () => {
  const byCode = read('{', 16).pipe(
    Effect.catchTag('PARSE_ERROR', (err) => Effect.succeed(err.reason)),
  );
  expectTypeOf<Effect.Error<typeof byCode>>().toEqualTypeOf<
    Failure<ReasonOf<'BodyTooLarge'>>
  >();
  expect(await Effect.runPromise(byCode)).toSatisfy(
    Predicate.isTagged('InvalidJson'),
  );

  const limit = await Effect.runPromise(
    read('{"a":1}', 4).pipe(
      Effect.catchReason('PAYLOAD_TOO_LARGE', 'BodyTooLarge', (reason) => {
        expectTypeOf(reason.limit).toEqualTypeOf<number>();
        return Effect.succeed(reason.limit);
      }),
    ),
  );
  expect(limit).toBe(4);
});

test('errors users make have no reason', () => {
  expect(new TrpcError({ code: 'NOT_FOUND' }).reason).toBeUndefined();
  expect(Object.keys(new TrpcError({ code: 'NOT_FOUND' }))).not.toContain(
    'reason',
  );
});
